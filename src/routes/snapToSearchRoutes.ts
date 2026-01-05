import { Router } from 'express';
import { SnapToSearchController } from '../controllers/snapToSearchController';

export const createSnapToSearchRouter = (controller: SnapToSearchController): Router => {
  const router = Router();
  const uploadMiddleware = controller.getUploaderMiddleware();

  router.get('/health', controller.health);
  router.post('/snap-to-search', uploadMiddleware, controller.handleSnapToSearch);
  router.post('/snap-to-search/:token/expand', controller.handleExpandSearch);

  return router;
};
