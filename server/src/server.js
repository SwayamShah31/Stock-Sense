import 'dotenv/config';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { setSocketServer, startDatabaseSync } from './services/realtime.js';

const PORT = Number(process.env.PORT || 5000);
const app = createApp();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

setSocketServer(io);

io.on('connection', (socket) => {
  socket.emit('notification:new', {
    title: 'Welcome to StockSense AI',
    message: 'Realtime notifications are connected.',
    type: 'success',
  });
});

async function bootstrap() {
  try {
    if (process.env.MONGODB_URI) {
      try {
        const connection = await connectDB(process.env.MONGODB_URI);
        startDatabaseSync(connection);
        console.log('MongoDB connected');
      } catch (dbError) {
        console.warn('MongoDB connection failed. Starting API without database access.');
        console.warn(dbError.message);
      }
    } else {
      console.warn('MONGODB_URI is not set. API will start without database access.');
    }

    server.listen(PORT, () => {
      console.log(`StockSense API running on port ${PORT}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

bootstrap();
