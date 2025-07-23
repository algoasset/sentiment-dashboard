document.addEventListener('DOMContentLoaded', () => {
    const symbolSelect = document.getElementById('symbol-select');
    // Using a more reliable CORS proxy to bypass browser security restrictions on the live site
    const API_BASE = `https://api.allorigins.win/raw?url=https://fapi.binance.com/fapi/v1`;
    const MAX_DATA_POINTS = 20;

    let chartInstances = {};
    let dataState = {}; // To hold last price/oi for each symbol
    let activeInterval = null;

    const chartConfigs = {
        sentimentScoreChart: {
            type: 'line',
            label: 'Sentiment Score',
            borderColor: '#2ECC71',
            backgroundColor: 'rgba(46, 204, 113, 0.1)',
            options: { scales: { y: { min: -10, max: 10 } } }
        },
        fundingRateChart: {
            type: 'bar',
            label: 'Funding Rate (%)',
            backgroundColor: '#3498DB'
        },
        openInterestChart: {
            type: 'line',
            label: 'Open Interest (USD)',
            borderColor: '#F39C12',
        }
    };

    function createOrUpdateChart(canvasId, config, labels, data) {
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
        }
        const ctx = document.getElementById(canvasId).getContext('2d');
        chartInstances[canvasId] = new Chart(ctx, {
            type: config.type,
            data: {
                labels: labels,
                datasets: [{
                    label: config.label,
                    data: data,
                    borderColor: config.borderColor,
                    backgroundColor: config.backgroundColor,
                    fill: !!config.backgroundColor,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                ...config.options
            }
        });
    }

    function addDataToCharts(symbol, newData) {
        const now = new Date().toLocaleTimeString();
        const state = dataState[symbol];

        // Add new data
        state.labels.push(now);
        state.sentimentData.push(newData.sentimentScore);
        state.fundingData.push(newData.fundingRate * 100);
        state.oiData.push(newData.openInterest);

        // Trim old data
        if (state.labels.length > MAX_DATA_POINTS) {
            state.labels.shift();
            state.sentimentData.shift();
            state.fundingData.shift();
            state.oiData.shift();
        }

        // Update the visible charts if the current symbol is the one being updated
        if (symbolSelect.value === symbol) {
            updateAllCharts(symbol);
        }
    }
    
    function updateAllCharts(symbol) {
        const state = dataState[symbol];
        createOrUpdateChart('sentimentScoreChart', chartConfigs.sentimentScoreChart, state.labels, state.sentimentData);
        createOrUpdateChart('fundingRateChart', chartConfigs.fundingRateChart, state.labels, state.fundingData);
        createOrUpdateChart('openInterestChart', chartConfigs.openInterestChart, state.labels, state.oiData);
    }

    function calculateSentimentScore(fundingRate, oi, price, state) {
        let score = 0;
        const fundingRatePercent = fundingRate * 100;
        if (fundingRatePercent > 0.05) score -= 5;
        else if (fundingRatePercent < -0.05) score += 5;
        else score += (fundingRatePercent / 0.05) * -5;

        if (state.lastPrice > 0) {
            const oiTrend = oi > state.lastOpenInterest;
            const priceTrend = price > state.lastPrice;
            if (oiTrend && priceTrend) score += 3;
            else if (oiTrend && !priceTrend) score -= 3;
        }
        
        return Math.max(-10, Math.min(10, score));
    }

    async function fetchData(symbol) {
        try {
            console.log(`Fetching new data for ${symbol}...`);
            
            // Note: allorigins requires the URL to be encoded
            const encodedSymbol = encodeURIComponent(symbol);
            const [premiumIndex, openInterestHist] = await Promise.all([
                fetch(`${API_BASE}/premiumIndex?symbol=${encodedSymbol}`).then(res => res.json()),
                fetch(`${API_BASE}/openInterestHist?symbol=${encodedSymbol}&period=5m&limit=1`).then(res => res.json())
            ]);

            const fundingRate = parseFloat(premiumIndex.lastFundingRate);
            const markPrice = parseFloat(premiumIndex.markPrice);
            const openInterest = parseFloat(openInterestHist[0].sumOpenInterestValue);

            const state = dataState[symbol];
            const sentimentScore = calculateSentimentScore(fundingRate, openInterest, markPrice, state);
            
            state.lastOpenInterest = openInterest;
            state.lastPrice = markPrice;

            addDataToCharts(symbol, { sentimentScore, fundingRate, openInterest });

        } catch (error) {
            console.error(`Failed to fetch data for ${symbol}:`, error);
        }
    }

    function initializeSymbol(symbol) {
        if (!dataState[symbol]) {
            dataState[symbol] = {
                labels: [],
                sentimentData: [],
                fundingData: [],
                oiData: [],
                lastOpenInterest: 0,
                lastPrice: 0
            };
        }
    }

    function changeSymbol(symbol) {
        console.log(`Changing symbol to ${symbol}`);
        initializeSymbol(symbol);
        
        // Clear and update charts for the new symbol
        updateAllCharts(symbol);

        // Stop the old interval and start a new one
        if (activeInterval) {
            clearInterval(activeInterval);
        }
        
        fetchData(symbol); // Fetch immediately
        activeInterval = setInterval(() => fetchData(symbol), 30000);
    }

    // --- Event Listeners and Initial Setup ---
    symbolSelect.addEventListener('change', (event) => {
        changeSymbol(event.target.value);
    });

    // Initial load
    changeSymbol(symbolSelect.value);
});