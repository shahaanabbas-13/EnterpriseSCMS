import { Response } from 'express';
import { DemoSnapshotService } from '../services/demoSnapshot.service';
import { ApiResponse } from '../utils/ApiResponse';

export class DemoController {
  static async getSnapshot(_req: unknown, res: Response): Promise<void> {
    const snapshot = await DemoSnapshotService.getSnapshot();
    res.setHeader('Cache-Control', 'no-store');
    ApiResponse.success(res, snapshot, 'Read-only recruiter demo snapshot');
  }
}
