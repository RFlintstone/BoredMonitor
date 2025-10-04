import express, { Request, Response } from 'express';
import { DateTime } from 'luxon';
import { MongoClient, ChangeStreamDocument, WithId } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- MongoDB setup ---
if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
}
const uri = process.env.MONGODB_URI as string;
const client = new MongoClient(uri);
let db: any;
let collection: any;

// --- State model ---
interface BoredomState {
    _id: string;
    level: number;
    lastUpdateTime: number;
    boredomSpikes: number;
}

const STATE_ID = 'current_boredom_state';
let currentState: BoredomState | null = null;

// --- Initialize DB, load state, subscribe to changes ---
async function initializeDatabase() {
    try {
        await client.connect();
        console.log('Connected to MongoDB Atlas');
        db = client.db('boredomDB');

        // Ensure collection exists
        const collections = await db.listCollections({ name: 'boredomState' }).toArray();
        if (collections.length === 0) {
            await db.createCollection('boredomState');
            console.log('Collection "boredomState" created');
        }
        collection = db.collection('boredomState');

        // Load or create initial state
        const existingState = await collection.findOne({ _id: STATE_ID });
        if (!existingState) {
            currentState = {
                _id: STATE_ID,
                level: 0,
                lastUpdateTime: Date.now(),
                boredomSpikes: 0,
            };
            await collection.insertOne(currentState);
            console.log('Default state created in database');
        } else {
            currentState = existingState as BoredomState;
            console.log('State loaded from database:', currentState);
        }

        // Change Stream: keep replicas in sync
        const changeStream = collection.watch([], { fullDocument: 'updateLookup' });

        function hasFullDocument(
            change: ChangeStreamDocument<BoredomState>
        ): change is ChangeStreamDocument<BoredomState> & { fullDocument: WithId<BoredomState> } {
            return !!(change as any).fullDocument;
        }

        changeStream.on('change', (change: ChangeStreamDocument<BoredomState>) => {
            if (!hasFullDocument(change)) return;
            if (change.fullDocument._id !== STATE_ID) return;

            currentState = {
                _id: change.fullDocument._id,
                level: change.fullDocument.level,
                lastUpdateTime: change.fullDocument.lastUpdateTime,
                boredomSpikes: change.fullDocument.boredomSpikes,
            };

            console.log('State synced from change stream:', currentState);
        });
        changeStream.on('error', (err: unknown) => {
            console.error('Change stream error:', err);
        });
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

// --- Helpers ---
function getState(): Omit<BoredomState, '_id'> {
    if (!currentState) throw new Error("State not initialized yet");
    return {
        level: currentState.level,
        lastUpdateTime: currentState.lastUpdateTime,
        boredomSpikes: currentState.boredomSpikes,
    };
}

async function updateState(
    updates: Partial<Omit<BoredomState, '_id'>>,
    options?: { incSpikes?: number }
) {
    if (!currentState) return;

    const atomicUpdate: any = {};
    if (Object.keys(updates).length > 0) atomicUpdate.$set = updates;
    if (options?.incSpikes && options.incSpikes !== 0) atomicUpdate.$inc = { boredomSpikes: options.incSpikes };

    if (Object.keys(atomicUpdate).length === 0) return;

    try {
        const result = await collection.findOneAndUpdate(
            { _id: STATE_ID },
            atomicUpdate,
            { returnDocument: 'after', upsert: true }
        );

        if (result.value) {
            currentState = {
                _id: result.value._id,
                level: result.value.level,
                lastUpdateTime: result.value.lastUpdateTime,
                boredomSpikes: result.value.boredomSpikes,
            };
        }
    } catch (err) {
        console.error('Error persisting state:', err);
    }
}

async function applyDecay() {
    const state = getState();
    const now = Date.now();
    const timeElapsed = now - state.lastUpdateTime;
    const decayAmount = Math.floor(timeElapsed / 3600000); // 1 per hour

    if (decayAmount > 0) {
        const newLevel = Math.max(0, state.level - decayAmount);
        await updateState({
            level: newLevel,
            lastUpdateTime: now
        });
    }
}

// --- Express setup ---
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API ---
app.get('/api/boredom', async (req: Request, res: Response) => {
    try {
        await applyDecay();
        const state = getState();

        const startTime = DateTime.fromObject(
            { year: 2025, month: 10, day: 13, hour: 11, minute: 0, second: 0 },
            { zone: 'Europe/Amsterdam' }
        ).toMillis();

        const timeAlone = Math.floor((Date.now() - startTime) / 1000);
        res.json({ ...state, timeAlone, serverTime: Date.now() });
    } catch (error) {
        console.error('Error fetching boredom state:', error);
        res.status(500).json({ error: 'Failed to fetch boredom state' });
    }
});

app.post('/api/boredom/set', async (req: Request, res: Response) => {
    try {
        await applyDecay();
        const { level } = req.body;

        if (typeof level !== 'number' || level < 0 || level > 100) {
            return res.status(400).json({ success: false, message: 'Level must be 0–100' });
        }

        const newLevel = Math.round(level);
        await updateState(
            { level: newLevel, lastUpdateTime: Date.now() },
            { incSpikes: 1 }
        );

        res.json({ success: true, newLevel });
    } catch (error) {
        console.error('Error setting boredom level:', error);
        res.status(500).json({ success: false, message: 'Failed to update boredom level' });
    }
});

app.post('/api/boredom/reset', async (req: Request, res: Response) => {
    try {
        await updateState({
            level: 0,
            boredomSpikes: 0,
            lastUpdateTime: Date.now()
        });
        res.json({ success: true, newLevel: 0 });
    } catch (error) {
        console.error('Error resetting boredom state:', error);
        res.status(500).json({ success: false, message: 'Failed to reset boredom state' });
    }
});

// Auth
const VALID_USER = process.env.ADMIN_USERNAME || 'admin';
const VALID_PASS = process.env.ADMIN_PASSWORD || 'password';
app.post('/api/auth/check', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ authenticated: false, message: 'Missing credentials' });
    }
    if (username === VALID_USER && password === VALID_PASS) {
        return res.json({ authenticated: true });
    }
    return res.status(401).json({ authenticated: false });
});

// SPA fallback
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- Startup ---
async function startServer() {
    await initializeDatabase();
    app.listen(PORT, () => {
        console.log(`Node.js backend + React frontend running on port ${PORT}`);
    });
}
startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing MongoDB connection...');
    await client.close();
    process.exit(0);
});
