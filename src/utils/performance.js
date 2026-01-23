/**
 * Performance and Memory Logging Utility
 */

export const getMemoryUsage = () => {
    if (window.performance && window.performance.memory) {
        const memory = window.performance.memory;
        return {
            usedJSHeapSize: (memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
            totalJSHeapSize: (memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
            jsHeapSizeLimit: (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB',
            percentUsed: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2) + '%'
        };
    }
    return null;
};

export const logMemoryUsage = (label = 'Memory Check') => {
    const usage = getMemoryUsage();
    if (usage) {
        console.group(`📊 [Performance] ${label}`);
        console.log(`Used Heap: ${usage.usedJSHeapSize}`);
        console.log(`Total Heap: ${usage.totalJSHeapSize}`);
        console.log(`Heap Limit: ${usage.jsHeapSizeLimit}`);
        console.log(`Usage: ${usage.percentUsed}`);
        console.groupEnd();
    } else {
        console.log(`📊 [Performance] ${label}: Memory monitoring not supported in this browser.`);
    }
};

/**
 * Measures the execution time of a function and logs memory before/after
 */
export const measurePerformance = async (label, fn) => {
    const startMemory = getMemoryUsage();
    const startTime = performance.now();

    try {
        const result = await fn();
        const endTime = performance.now();
        const endMemory = getMemoryUsage();

        console.group(`⏱️ [Performance] ${label}`);
        console.log(`Execution Time: ${(endTime - startTime).toFixed(2)} ms`);
        if (startMemory && endMemory) {
            console.log(`Memory Delta: ${(parseFloat(endMemory.usedJSHeapSize) - parseFloat(startMemory.usedJSHeapSize)).toFixed(2)} MB`);
            console.log(`Current Usage: ${endMemory.usedJSHeapSize}`);
        }
        console.groupEnd();

        return result;
    } catch (error) {
        console.error(`❌ [Performance] ${label} Failed:`, error);
        throw error;
    }
};
