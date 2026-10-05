import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { HistoryController } from '../controllers/history.controller';
import { upload } from '../../../middleware/upload.middleware';
import { authenticateToken } from '../../../middleware/auth.middleware';

const router = Router();

router.post('/chat', authenticateToken, upload.single('file'), ChatController.sendMessage);
router.get('/chat-history', authenticateToken, HistoryController.getHistory);

export default router;
