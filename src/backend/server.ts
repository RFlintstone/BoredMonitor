import express, { Request, Response } from 'express';
import { DateTime } from 'luxon';

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// --- State to track boredom ---
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

// Serve React build (frontend) from 'public' folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Simple decay function ---
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
// Get current boredom
app.get('/api/boredom', (req: Request, res: Response) => {
    applyDecay();

    // Specify the target timezone
    const startTime = DateTime.fromObject(
        { year: 2025, month: 10, day: 13, hour: 11, minute: 0, second: 0 },
        { zone: 'Europe/Amsterdam' }
    ).toMillis();

    // Compute seconds since that moment
    const timeAlone = Math.floor((Date.now() - startTime) / 1000);
    res.json({
        ...state,
        timeAlone,
        serverTime: Date.now()
    });
});

// Set boredom level
app.post('/api/boredom/set', (req: Request, res: Response) => {
    applyDecay();
    const { level } = req.body;

    if (typeof level !== 'number' || level < 0 || level > 100) {
        console.error(`Invalid level provided: ${level}`);
        return res.status(400).json({ success: false, message: 'Level must be a number between 0 and 100.' });
    }

    state.level = Math.round(level);
    state.boredomSpikes += 1;
    state.lastUpdateTime = Date.now();
    res.json({ success: true, newLevel: state.level });
});

// Emergency reset
app.post('/api/boredom/reset', (req: Request, res: Response) => {
    state.level = 0;
    state.boredomSpikes = 0;
    state.lastUpdateTime = Date.now();
    res.json({ success: true, newLevel: state.level });
});

const VALID_USER = process.env.ADMIN_USER || 'admin';
const VALID_PASS = process.env.ADMIN_PASS || 'password';

app.post('/api/auth/check', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ authenticated: false, message: 'Missing credentials' });
    }

    if (username === VALID_USER && password === VALID_PASS) {
        return res.json({ authenticated: true });
    } else {
        return res.status(401).json({ authenticated: false });
    }
});

// SPA fallback: send React's index.html
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- Start backend ---
app.listen(PORT, () => {
    console.log(`Node.js backend + React frontend running on port ${PORT}`);
});
