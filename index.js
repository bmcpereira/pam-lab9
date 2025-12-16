const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { Mutex } = require('async-mutex'); // Mutex library for thread-safe operations
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// In-memory message storage
let messages = [];
const messagesMutex = new Mutex(); // Mutex for safe access to `messages`

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/', function (_, res) {
    res.redirect('/api-docs');
});

// GET /api/messages - Retrieve all messages
app.get('/api/messages', async (_, res) => {
    const release = await messagesMutex.acquire(); // Acquire the mutex
    try {
        const now = Date.now();
        // Filter out expired messages
        messages = messages.filter(msg => msg.expiry > now);

        // Map messages to exclude the `expiry` property
        const responseMessages = messages.map(({ expiry, ...msg }) => msg);
        res.json(responseMessages);
    } finally {
        release(); // Release the mutex
    }
});

// POST /api/message - Add a new message
app.post('/api/message', async (req, res) => {
    const { username, text } = req.body;

    if (!username || !text) {
        return res.status(400).json({ error: 'Username and text are required' });
    }

    const message = {
        id: uuidv4(),
        username,
        text,
        timestamp: new Date().toISOString(), // Set the timestamp when the message is created
        expiry: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    };

    const release = await messagesMutex.acquire(); // Acquire the mutex
    try {
        messages.push(message); // Safely add the new message
        res.status(201).json(message);
    } finally {
        release(); // Release the mutex
    }
});

// Function to periodically clean up expired messages
setInterval(async () => {
    const now = Date.now();
    const release = await messagesMutex.acquire(); // Acquire the mutex
    try {
        messages = messages.filter(msg => msg.expiry > now); // Safely filter messages
        console.log('Expired messages cleared');
    } finally {
        release(); // Release the mutex
    }
}, 60 * 1000); // Check every minute

// Start the server
const server = app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}!`);
});

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;
