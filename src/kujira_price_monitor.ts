import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';

require('dotenv').config({path: '.env', override: false});

let endpointURL: string;

async function fetchMissCounter(): Promise<number> {
    try {
        const response = await axios.get(endpointURL);
        return response.data.miss_counter;
    } catch (error: any) {
        console.error(endpointURL, 'Error fetching miss counter:', error.message);
        throw new Error('Error fetching miss counter');
    }
}

async function sendTelegramMessage(missDifference: number): Promise<void> {
    if (!process.env.TELEGRAM_BOT_ID || !process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_CHAT) {
        throw new Error('Telegram bot ID, token or chat ID not set.');
    }

    // Send Telegram message
    const bot = new TelegramBot(`${process.env.TELEGRAM_BOT_ID}:${process.env.TELEGRAM_TOKEN}`);
    const message = `🚨 Kujira Price tracker monitor alert!\n You are missing too many blocks. Miss counter exceeded: ${missDifference}`;

    await bot.sendMessage(process.env.TELEGRAM_CHAT, message);
}

export async function main(): Promise<void> {
    const missTolerance = parseInt(process.env.MISS_TOLERANCE!);
    const missTolerancePeriod = parseInt(process.env.MISS_TOLERANCE_PERIOD!);
    const sleepDuration = parseInt(process.env.SLEEP!);
    const alertSleepDuration = parseInt(process.env.ALERT_SLEEP_PERIOD!);
    const rpc = process.env.RPC;
    const valoper = process.env.VALOPER_ADDRESS;

    endpointURL = `${rpc}/oracle/validators/${valoper}/miss`;

    let previousMissCounter = await fetchMissCounter();
    let previousTimestamp = new Date().getTime();
    let lastMissCounter = 0;
    let lastAlertedPeriod = 0;
    while (true) {
        console.log('Running checks...');
        let currentMissCounter = await fetchMissCounter();

        // Check if the miss counter exceeds the tolerance
        let missDifference = currentMissCounter - previousMissCounter;
        if (missDifference >= missTolerance) {
            console.log('Missing too many price updates...');
            let timeDifference = new Date().getTime() - lastAlertedPeriod;
            if (timeDifference / 1000 > alertSleepDuration) {
                console.log('Sending alert message');
                await sendTelegramMessage(missDifference);
                lastAlertedPeriod = new Date().getTime();
                previousMissCounter = currentMissCounter;
            } else {
                console.log('Alert message sent too recently. Skipping.');
            }
        }

        let currentTimestamp = new Date().getTime();

        // Refresh the missing period if we are missing blocks within the period
        if (currentMissCounter > lastMissCounter) {
            console.log(`Missing counter has increased, current missed: ${currentMissCounter - previousMissCounter}. Refreshing previous incident timestamp.`);
            previousTimestamp = new Date().getTime();
        }

        let timeDifference = currentTimestamp - previousTimestamp;
        if (timeDifference / 1000 > missTolerancePeriod) {
            console.log(`No more misses happened since last one. Last missed: ${currentMissCounter - previousMissCounter}. Reset monitoring flags`)
            // Reset the miss counter if the tolerance period has passed
            previousMissCounter = currentMissCounter;
            previousTimestamp = currentTimestamp;
        }

        lastMissCounter = currentMissCounter;

        if (process.env.APP_ENV === 'test') {
            break;
        }

        // Sleep for the specified duration
        await new Promise((resolve) => setTimeout(resolve, sleepDuration * 1000));
    }
}

main().catch((error) => {
    console.error('An error occurred:', error.message);
    process.exit(1);
});
