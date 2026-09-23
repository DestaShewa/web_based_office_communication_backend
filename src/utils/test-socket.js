const { io } = require('socket.io-client');
const axios = require('axios'); // We'll use axios to login first

const SERVER_URL = 'http://localhost:5000';

const testSocket = async () => {
    try {
        console.log('--- Phase 1: Logging in to get JWT ---');
        const loginRes = await axios.post(`${SERVER_URL}/api/v1/auth/login`, {
            email: 'tewodrosbesha@gmail.com',
            password: 'admin1234'
        });

        const cookieHeader = loginRes.headers['set-cookie'][0];
        const rawJwt = cookieHeader.split(';')[0].split('=')[1];
        const jwt = decodeURIComponent(rawJwt);
        console.log('Successfully logged in and retrieved JWT.');

        console.log('\n--- Phase 2: Connecting to Socket.io ---');
        const socket = io(SERVER_URL, {
            auth: {
                token: jwt
            }
        });

        socket.on('connect', () => {
            console.log('Socket Connected! ID:', socket.id);

            console.log('\n--- Phase 3: Triggering a Status Update via API ---');
            // We update status via HTTP and expect a Socket broadcast
            axios.patch(`${SERVER_URL}/api/v1/users/status`,
                { status: 'Busy' },
                { headers: { Cookie: `jwt=${jwt}` } }
            ).then(() => console.log('HTTP Status update sent.'));
        });

        // Listen for the broadcast
        socket.on('status_updated', (data) => {
            console.log('\n[LIVE BROADCAST RECEIVED]');
            console.log('User ID:', data.userId);
            console.log('New Status:', data.status);

            console.log('\n✅ Verification Complete! Socket.io is working perfectly.');
            socket.disconnect();
            process.exit(0);
        });

        socket.on('connect_error', (err) => {
            console.error('Socket Connection Error:', err.message);
            process.exit(1);
        });

    } catch (error) {
        console.error('Test Failed:', error.response?.data?.message || error.message);
        process.exit(1);
    }
};

testSocket();
