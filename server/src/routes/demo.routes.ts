import { Router } from 'express';
import { DemoController } from '../controllers/demo.controller';

const router = Router();

// Intentionally public and read-only. The service returns a sanitized snapshot;
// this route exposes no write operations and never accepts query filters.
router.get('/snapshot', DemoController.getSnapshot);

export default router;
