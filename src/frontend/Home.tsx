import React, {useCallback, useEffect, useRef, useState} from 'react';
import * as d3 from 'd3';
import './Home.css'; // Assuming you put the component-specific CSS here

// Define the shape of the data fetched from the API
interface BoredomMetric {
    level: number;
    timeAlone: number;
    timestamp: Date;
}

const API_URL = '/api';

// Accepts number (seconds) or a string-like fallback.
// Returns string like "10d15:39:55" or "-10d15:39:55"
function formatTimeAlone(raw: number | string): string {
    // Coerce to number
    let totalSeconds = Number(raw);

    if (Number.isNaN(totalSeconds)) {
        totalSeconds = 0;
    }

    const negative = totalSeconds < 0;
    let abs = Math.abs(totalSeconds);

    // Correct breakdown
    const days = Math.floor(abs / 86400);
    abs -= days * 86400;

    const hours = Math.floor(abs / 3600);
    abs -= hours * 3600;

    const minutes = Math.floor(abs / 60);
    const seconds = abs - minutes * 60;

    const pad = (n: number) => String(n).padStart(2, '0');
    const signStr = negative ? '-' : '';

    return `${signStr}${days}d${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// --- Component Definition ---
const Home: React.FC = () => {
    let [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [currentLevel, setCurrentLevel] = useState<number>(0);
    const [timeAlone, setTimeAlone] = useState<number>(0);
    const [lastUpdate, setLastUpdate] = useState<string>('NEVER');
    const [statusText, setStatusText] = useState<string>('COMMENCING LACK-OF-STIMULUS PROTOCOL...');
    const [suggestions, setSuggestions] = useState<string>('> Waiting for meaningful data. Try not to die of ennui first.');
    const [alertLevel, setAlertLevel] = useState<string>('✓ NOMINAL: SUBJECT IS SAFE (FOR NOW)');
    const [boredomInput, setBoredomInput] = useState<number>(50);

    const handleLogin = async () => {
        const username = prompt('Enter username') || '';
        const password = prompt('Enter password') || '';

        if (!username || !password) {
            alert('Username and password are required');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/auth/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            setIsAuthenticated(!!data.authenticated);

            if (!data.authenticated) {
                alert('Login failed');
            }
        } catch (err) {
            console.error('Auth check failed', err);
            setIsAuthenticated(false);
        }
    };

    // Ref to hold the historical data array across renders
    const historicalDataRef = useRef<BoredomMetric[]>([]);

    // Refs for the D3 SVG elements
    const chart1Ref = useRef<SVGSVGElement>(null);
    const chart2Ref = useRef<SVGSVGElement>(null);
    const chart3Ref = useRef<SVGSVGElement>(null);
    const chart4Ref = useRef<SVGSVGElement>(null);

    // --- Status and Suggestions Logic ---
    const updateStatus = useCallback((level: number) => {
        let status: string = '<span>';
        let suggestion: string = '<span>';

        const thresholds = [
            {
                min: 6, max: 10, status: 'LOW: SOMEONE MIGHT NOTICE YOU',
                suggestion: '1) Wave at your reflection. It is statistically unlikely to wave back.<br>2) Converse with your houseplant. It offers more empathy than most humans.<br>3) Compose a cheerful note to yourself. Read it aloud, preferably dramatically.'
            },
            {
                min: 11, max: 20, status: 'LEVEL 10-20: SLIGHTLY IGNORED',
                suggestion: '1) Learn a solo dance move. Your audience is unimpressed, but consistent.<br>2) Bake cookies for no one. Delicious futility awaits.<br>3) Rearrange your furniture. You still live alone, but it feels productive.'
            },
            {
                min: 21, max: 30, status: 'LEVEL 20-30: MILDLY LONELY',
                suggestion: '1) Start an indoor garden. The plants won’t judge your social inadequacies.<br>2) Build a blanket fort. It is the only fortress that guarantees no visitors.<br>3) Write a letter to your future self. It may never read it.'
            },
            {
                min: 31, max: 40, status: 'LEVEL 30-40: NOTICEABLY LONELY',
                suggestion: '1) Watch a movie. Provide commentary. Your imaginary audience will applaud politely.<br>2) Learn a skill online. No one will notice, but at least you tried.<br>3) Doodle your emotions. It’s cheaper than therapy and equally effective.'
            },
            {
                min: 41, max: 50, status: 'LEVEL 40-50: SOCIAL ABANDONMENT',
                suggestion: '1) Organize your bookshelf by color. At least something is in order.<br>2) Attempt solo yoga or meditation. Ohm yourself to sanity.<br>3) Cook a fancy meal. Admire your effort. Eat alone. Revel in solitude.'
            },
            {
                min: 51, max: 60, status: 'LEVEL 50-60: PATRONIZED OCCASIONALLY',
                suggestion: '1) Listen to a podcast. Respond aloud. It hears you. That is enough.<br>2) Take a scenic walk. Narrate your adventure to yourself.<br>3) Start a journal. Record events that never mattered to anyone else.'
            },
            {
                min: 61, max: 70, status: 'LEVEL 60-70: ALMOST FAMOUS TO NO ONE',
                suggestion: '1) Film a TED talk. For one. Yourself.<br>2) Make a scrapbook of your life. Nobody else will care.<br>3) Learn an instrument. Play for an audience of zero.'
            },
            {
                min: 71, max: 80, status: 'LEVEL 70-80: FRIENDSHIP OPTIONAL',
                suggestion: '1) Have a solo picnic indoors. Invite imaginary friends. They RSVP promptly.<br>2) Play board games alone. You always win. How thrilling.<br>3) Perform a story alone. Multiple roles. No applause.'
            },
            {
                min: 81, max: 90, status: 'LEVEL 80-90: IRONICALLY LONELY',
                suggestion: '1) Write fan mail. Seal it. Never send it. Anticipate silence.<br>2) Create art. Admire it. Acknowledge that no one else will.<br>3) Build a Lego city. Conduct tours for invisible guests.'
            },
            {
                min: 91, max: 100, status: 'LEVEL 90-100: LEGENDARY SOLITUDE',
                suggestion: '1) Throw a solo party. Dance wildly. Nobody criticizes.<br>2) Record a podcast for no listeners. Perfect audience retention.<br>3) Write a novel starring only yourself. Pulitzer is optional.'
            },
        ];

        if (level <= 5) {
            status += 'NOMINAL: SOCIAL LIFE FLOURISHING';
            suggestion += '1) Delight in your imaginary companions. They never disappoint.<br>2) Host a shadow tea party. Everyone is invited, nobody shows up.<br>3) Brag subtly on social media about your thriving social life. Nobody will notice, but at least you tried.';
        } else {
            const matched = thresholds.find(t => level >= t.min && level <= t.max);

            if (matched) {
                status += matched.status;
                suggestion += matched.suggestion;
            } else {
                status = 'UNKNOWN LEVEL';
                suggestion = '> OPTIONS: Try anything; luck may be your only companion.';
            }
        }

        status += '</span>';
        suggestion += '</span>';

        setStatusText(status);
        setSuggestions(suggestion);
    }, [setStatusText, setSuggestions]);

    // --- D3 Chart Drawing Logic ---
    const drawCharts = useCallback(() => {
        const historicalData = historicalDataRef.current;
        if (!historicalData.length) return;

        const margin = {top: 20, right: 20, bottom: 30, left: 40};
        const currentThreat = historicalData[historicalData.length - 1].level;

        // Reusable function to calculate dimensions
        const getDimensions = (ref: React.RefObject<SVGSVGElement>) => {
            const width = ref.current?.getBoundingClientRect().width || 0;
            const height = ref.current?.getAttribute('height') ? +ref.current.getAttribute('height')! : 250;
            return {
                width: width - margin.left - margin.right,
                height: height - margin.top - margin.bottom,
                fullWidth: width,
                fullHeight: height,
            };
        };

        // --- Chart 1: Boredom Level Over Time (Line Chart) ---
        if (chart1Ref.current) {
            const {width, height} = getDimensions(chart1Ref);
            d3.select(chart1Ref.current).selectAll('*').remove();
            const svg1 = d3.select(chart1Ref.current).append('g').attr('transform', `translate(${margin.left},${margin.top})`);

            const x1 = d3.scaleTime()
                .domain(d3.extent(historicalData, d => d.timestamp) as [Date, Date] || [new Date(), new Date()])
                .range([0, width]);
            const y1 = d3.scaleLinear().domain([0, 100]).range([height, 0]);

            const line = d3.line<BoredomMetric>()
                .x(d => x1(d.timestamp))
                .y(d => y1(d.level))
                .curve(d3.curveMonotoneX);

            svg1.append('path').datum(historicalData).attr('fill', 'none').attr('stroke', '#ff9900').attr('stroke-width', 2).attr('d', line as any);
            svg1.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x1).ticks(5));
            svg1.append('g').call(d3.axisLeft(y1).ticks(5));
        }

        // --- Chart 2: Existential Threat Gauge (Radial Chart) ---
        if (chart2Ref.current) {
            const {fullWidth, fullHeight} = getDimensions(chart2Ref);
            d3.select(chart2Ref.current).selectAll('*').remove();
            const svg2 = d3.select(chart2Ref.current).append('g').attr('transform', `translate(${fullWidth / 2},${fullHeight / 2})`);

            const radius = Math.min(fullWidth, fullHeight) / 2 - 20;
            const arc = d3.arc<number>()
                .innerRadius(radius - 20)
                .outerRadius(radius)
                .startAngle(0)
                .endAngle((currentThreat / 100) * 2 * Math.PI);

            svg2.append('path').datum(currentThreat).attr('d', arc as any)
                .attr('fill', currentThreat > 80 ? '#e60000' : currentThreat > 50 ? '#ff9900' : '#8cc63f');

            svg2.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('fill', '#fff')
                .text(`${currentThreat.toFixed(0)}%`);
        }

        // --- Chart 3: Rate of Change Tracker (Line Chart) ---
        if (chart3Ref.current) {
            const {width, height} = getDimensions(chart3Ref);
            d3.select(chart3Ref.current).selectAll('*').remove();
            const svg3 = d3.select(chart3Ref.current).append('g').attr('transform', `translate(${margin.left},${margin.top})`);

            const rocData = historicalData.map((d, i, arr) => ({
                timestamp: d.timestamp,
                roc: i === 0 ? 0 : d.level - arr[i - 1].level
            }));

            const x3 = d3.scaleTime().domain(d3.extent(rocData, d => d.timestamp) as [Date, Date] || [new Date(), new Date()]).range([0, width]);
            const y3 = d3.scaleLinear().domain(d3.extent(rocData, d => d.roc as number) as [number, number]).range([height, 0]);
            const line3 = d3.line<{ timestamp: Date, roc: number }>()
                .x(d => x3(d.timestamp))
                .y(d => y3(d.roc))
                .curve(d3.curveMonotoneX);

            svg3.append('path').datum(rocData).attr('fill', 'none').attr('stroke', '#0066cc').attr('stroke-width', 2).attr('d', line3 as any);
            svg3.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x3).ticks(5));
            svg3.append('g').call(d3.axisLeft(y3));
        }

        // --- Chart 4: Boredom Frequency Histogram ---
        if (chart4Ref.current) {
            const {width, height} = getDimensions(chart4Ref);
            d3.select(chart4Ref.current).selectAll('*').remove();
            const svg4 = d3.select(chart4Ref.current).append('g').attr('transform', `translate(${margin.left},${margin.top})`);

            const bins = d3.bin().thresholds(10)(historicalData.map(d => d.level));
            const x4 = d3.scaleLinear().domain([0, 100]).range([0, width]);
            const y4 = d3.scaleLinear().domain([0, d3.max(bins, d => d.length) || 1]).range([height, 0]);

            svg4.selectAll('rect')
                .data(bins)
                .join('rect')
                .attr('x', d => x4(d.x0 || 0))
                .attr('y', d => y4(d.length))
                .attr('width', d => x4(d.x1 || 0) - x4(d.x0 || 0) - 1)
                .attr('height', d => height - y4(d.length))
                .attr('fill', '#8cc63f');

            svg4.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x4));
            svg4.append('g').call(d3.axisLeft(y4));
        }
    }, [updateStatus]);

    // --- Data Fetching Logic ---
    const fetchBoredom = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/boredom`);
            const data = await res.json();
            const timestamp = new Date();
            const newMetric: BoredomMetric = {...data, timestamp};

            // Update historical data
            historicalDataRef.current.push(newMetric);
            if (historicalDataRef.current.length > 50) {
                historicalDataRef.current.shift();
            }

            // Update state
            const level = parseFloat(data.level.toFixed(0));
            setCurrentLevel(level);
            setTimeAlone(data.timeAlone);
            setLastUpdate(timestamp.toLocaleTimeString());
            setAlertLevel(
                level > 90
                    ? '🚨 IMMINENT COLLAPSE: SUBJECT IS IN DANGER ZONE 5' // 91-100 (Red/Critical)
                    : level > 70
                        ? '⚠️ EXTREME RISK: SUBJECT IS IN DANGER ZONE 4'    // 71-90 (Red/Warning)
                        : level > 50
                            ? '🔶 ELEVATED ISOLATION: SUBJECT IS IN DANGER ZONE 3' // 51-70 (Orange/Warning)
                            : level > 25
                                ? '🟡 MINOR CONCERN: SUBJECT IS IN DANGER ZONE 2' // 26-50 (Yellow/Minor)
                                : '✓ NOMINAL: SUBJECT IS SAFE (DANGER ZONE 1)'    // 0-25 (Green/Nominal)
            );
            updateStatus(level);

            // Re-draw charts
            drawCharts();
        } catch (err) {
            console.error(err);
        }
    }, [updateStatus, drawCharts]);

    // --- Event Handlers ---
    const handleSubmit = async () => {
        if (boredomInput < 0 || boredomInput > 100) return alert('Value must be 0–100');

        await fetch(`${API_URL}/boredom/set`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({level: boredomInput})
        });
        fetchBoredom(); // Fetch latest data after submit
    };

    const handleReset = async () => {
        if (!confirm('Are you sure you want to reset all data?')) return;
        await fetch(`${API_URL}/reset`, {method: 'POST'});
        historicalDataRef.current = [];
        // Optionally, clear the charts and reset state here
        setCurrentLevel(0);
        setTimeAlone(0);
        setLastUpdate('NEVER');
        drawCharts(); // Clear charts by re-drawing empty state
    };

    // --- Component Mount and Interval Setup ---
    useEffect(() => {
        // Initial fetch and interval setup
        fetchBoredom();
        const interval = setInterval(fetchBoredom, 5000);

        // Cleanup on unmount
        return () => clearInterval(interval);
    }, [fetchBoredom]);

    // Use a secondary effect to redraw charts on window resize
    useEffect(() => {
        window.addEventListener('resize', drawCharts);
        return () => window.removeEventListener('resize', drawCharts);
    }, [drawCharts]);


    // --- JSX Rendering ---
    const levelBarColor = currentLevel > 80 ? '#e60000' : currentLevel > 50 ? '#ff9900' : '#8cc63f';

    return (
        <div className="p-4 md:p-12">
            {/* The tooltip from HTML is now a fixed-position React component or external element.
                For simplicity, we'll omit the D3-controlled tooltip element here. */}

            <div className="max-w-7xl mx-auto w-full">
                <header className="text-center mb-12">
                    <div className="aperture-box px-8 py-6 mb-4 max-w-fit mx-auto overflow-x-auto">
                        {/* Logo */}
                        <div style={{width: '525px', height: '160px', overflow: 'hidden', margin: '0 auto 0 25%'}}>
                            <img src="https://logos-world.net/wp-content/uploads/2023/09/Aperture-Science-Logo-1973.png"
                                 alt="Aperture Science Logo"
                                 style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center'}}/>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold aperture-title mt-4">APERTURE SCIENCE BOREDOM
                            MONITOR</h1>
                        <p className="text-base text-gray-400 mt-2">&gt;&gt; TEST SUBJECT UPTIME: NON-ZERO, THUS
                            PROBLEMATIC &lt;&lt;</p>
                        <p className="text-xs text-gray-600 mt-3">
                            <span className="font-bold">GLaDOS PROTOCOL:</span>
                            <span id="systemStatus" className="blink text-primary"> AWAITING MEANINGFUL FAILURE</span>
                        </p>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    {/* Boredom Level */}
                    <div className="aperture-box p-6">
                        <div className="text-xs text-gray-400 mb-4 border-b border-gray-700 pb-2">BOREDOM LEVEL (CORE
                            METRIC)
                        </div>
                        <div
                            className={`main-level-display text-center ${currentLevel > 80 ? 'status-critical' : currentLevel > 50 ? 'status-warning' : 'status-nominal'}`}>{currentLevel.toFixed(0)}</div>
                        <div className="text-center text-sm font-bold mt-2"
                             dangerouslySetInnerHTML={{__html: statusText}}></div>
                        <div className="mt-4 h-4 bg-black border border-gray-700 overflow-hidden rounded-sm">
                            <div className="h-full transition-all duration-500"
                                 style={{width: `${currentLevel}%`, backgroundColor: levelBarColor}}>
                            </div>
                        </div>
                    </div>

                    {/* Isolation Metrics */}
                    <div className="aperture-box p-6 flex flex-col justify-between">
                        <div>
                            <div className="text-xs text-gray-400 mb-4 border-b border-gray-700 pb-2">ISOLATION
                                METRICS
                            </div>
                            <div className="text-lg font-bold mb-2 text-primary">TIME ALONE (SECONDS COUNTING)</div>
                            <div className="text-5xl font-mono status-warning">{formatTimeAlone(timeAlone)}</div>
                        </div>
                        <div className="text-xs text-gray-600 mt-6">
                            LAST DATA PING: <span className="text-primary font-bold">{lastUpdate}</span>
                            <p className="mt-2">EXPECTED INTERVAL: 5.000s</p>
                        </div>
                    </div>

                    {/* GLaDOS Suggestions */}
                    <div className="aperture-box p-6 flex flex-col justify-between">
                        <div>
                            <div className="text-xs text-gray-400 mb-4 border-b border-gray-700 pb-2">GLaDOS ANALYSIS
                            </div>
                            <div className="text-sm mb-2 font-bold status-secondary">ACTION PLAN:</div>
                            <div className="text-xs space-y-2 text-primary"
                                 dangerouslySetInnerHTML={{__html: suggestions}}></div>
                        </div>
                        <div
                            className={`mt-4 text-xs blink text-center p-2 rounded-sm border ${currentLevel > 80 ? 'border-red-600 bg-red-900/20' : 'border-gray-700'}`}>
                            <span>{alertLevel}</span>
                        </div>
                    </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                    <div className="aperture-box p-6">
                        <div className="text-xs text-gray-400 mb-2">TEMPORAL ANALYSIS</div>
                        <div className="text-lg font-bold mb-4 text-primary">STIMULUS DEPRIVATION TIMELINE</div>
                        <svg ref={chart1Ref} className="w-full" height="250"></svg>
                    </div>
                    <div className="aperture-box p-6">
                        <div className="text-xs text-gray-400 mb-2">PSYCHOLOGICAL METRICS</div>
                        <div className="text-lg font-bold mb-4 text-primary">EXISTENTIAL THREAT GAUGE</div>
                        <svg ref={chart2Ref} className="w-full" height="250"></svg>
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                    <div className="aperture-box p-6">
                        <div className="text-xs text-gray-400 mb-2">STATISTICAL DISTRIBUTION</div>
                        <div className="text-lg font-bold mb-4 text-primary">BOREDOM FREQUENCY HISTOGRAM</div>
                        <svg ref={chart4Ref} className="w-full" height="250"></svg>
                    </div>
                    <div className="aperture-box p-6">
                        <div className="text-xs text-gray-400 mb-2">VOLATILITY ANALYSIS</div>
                        <div className="text-lg font-bold mb-4 text-primary">RATE OF CHANGE TRACKER</div>
                        <svg ref={chart3Ref} className="w-full" height="250"></svg>
                    </div>
                </div>

                {/* Manual Controls */}
                {isAuthenticated ? (
                    <>
                        <div className="aperture-box p-6">
                            <div className="text-xs text-gray-400 mb-4 border-b border-gray-700 pb-2">
                                MANUAL OVERRIDE CONTROLS
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm mb-2 text-primary font-bold">BOREDOM LEVEL INPUT
                                        (0-100):</label>
                                    <input type="number" min="0" max="100" value={boredomInput}
                                           onChange={(e) => setBoredomInput(parseInt(e.target.value) || 0)}
                                           className="w-full aperture-input p-3 font-mono focus:outline-none rounded-sm"/>
                                </div>
                                <div className="flex items-end">
                                    <button onClick={handleSubmit} id="submitBtn"
                                            className="w-full aperture-button py-3 px-6 rounded-sm">
                                        [ INITIATE DATA UPLOAD ]
                                    </button>
                                </div>
                            </div>
                            {/*<div className="mt-6">*/}
                            {/*    <button onClick={handleReset} id="resetBtn"*/}
                            {/*            className="w-full md:w-auto aperture-button py-2 px-6 rounded-sm">*/}
                            {/*        [ EMERGENCY RESET: DELETE ALL SUBJECT DATA ]*/}
                            {/*    </button>*/}
                            {/*</div>*/}
                            {/*<div id="message" className="mt-4 text-center text-sm hidden"></div>*/}
                        </div>
                    </>
                ) : (
                    <div className="text-center mb-12">
                        <button onClick={handleLogin} className="aperture-button py-3 px-6 rounded-sm">
                            [ LOGIN TO ENABLE MANUAL CONTROLS ]
                        </button>
                    </div>
                )}
                <footer className="text-center mt-12 text-xs text-gray-700">
                    <p>Aperture Science Enrichment Center - All Rights Reserved. Do not leave the test
                        chamber.</p>
                    <p className="mt-1">WARNING: THIS MONITORING STATION IS CURRENTLY LACKING MORAL
                        SUPERVISION.</p>
                </footer>
            </div>
        </div>
    );
};

export default Home;