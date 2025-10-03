import express, { Request, Response } from 'express';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 5000;

// State to track boredom (simulating persistence)
interface BoredomState {
    level: number;
    lastUpdateTime: number;
    boredomSpikes: number;
}

let state: BoredomState = {
    level: 0,
    lastUpdateTime: Date.now(),
    boredomSpikes: 0,
};

// --- Middleware ---
app.use(express.json());

// Serve the static frontend files from the 'public' directory
// This replaces Nginx's role for serving static content
app.use(express.static(path.join(__dirname, '..', 'public')));

// Simple decay function: boredom drops by 1 point per hour (3,600,000 ms)
const applyDecay = () => {
    const now = Date.now();
    const timeElapsed = now - state.lastUpdateTime;
    const decayAmount = Math.floor(timeElapsed / 3600000) * 1;

    if (decayAmount > 0) {
        state.level = Math.max(0, state.level - decayAmount);
        state.lastUpdateTime = now;
    }
};

// --- API Endpoints ---
// Endpoint to get the current boredom status
app.get('/api/boredom', (req: Request, res: Response) => {
    applyDecay();
    const timeAlone = Math.floor((Date.now() - state.lastUpdateTime) / 1000);
    res.json({
        ...state,
        timeAlone,
        serverTime: Date.now()
    });
});

// Endpoint to set the boredom level (user interaction: "Set Boredom")
app.post('/api/boredom/set', (req: Request, res: Response) => {
    applyDecay();
    const { level } = req.body;

    // Input validation: ensure level is a number between 0 and 100
    if (typeof level !== 'number' || level < 0 || level > 100) {
        // Log error and send a 400 response
        console.error(`Invalid level provided: ${level}`);
        return res.status(400).json({ success: false, message: 'Invalid level provided. Must be a number between 0 and 100.' });
    }

    state.level = Math.round(level); // Set the level and round to nearest integer
    state.boredomSpikes += 1; // Count this interaction as a "spike"
    state.lastUpdateTime = Date.now();
    res.json({ success: true, newLevel: state.level });
});

// Endpoint to reset boredom (user interaction: "Emergency Reset")
app.post('/api/boredom/reset', (req: Request, res: Response) => {
    state.level = 0;
    state.boredomSpikes = 0;
    state.lastUpdateTime = Date.now();
    res.json({ success: true, newLevel: state.level });
});

// Catch-all to serve index-backup.html for any other requests (SPA fallback)
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index-backup.html'));
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Node.js Backend and Frontend Server running on port ${PORT}`);
});
