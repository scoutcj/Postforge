import { cleanupOldImages } from '../services/storageService.js';

const IMAGE_RETENTION_DAYS = parseInt(process.env.IMAGE_RETENTION_DAYS || '60', 10);

/**
 * Weekly job to cleanup old images from Supabase Storage
 * Deletes images older than IMAGE_RETENTION_DAYS (default: 60 days)
 */
export async function runStorageCleanup() {
  console.log(`[CleanupJob] Starting storage cleanup (retention: ${IMAGE_RETENTION_DAYS} days)...`);

  try {
    const { deletedCount, freedSpace } = await cleanupOldImages(IMAGE_RETENTION_DAYS);

    const freedSpaceMB = (freedSpace / (1024 * 1024)).toFixed(2);
    console.log(`[CleanupJob] Cleanup complete: ${deletedCount} files deleted, ${freedSpaceMB}MB freed`);

    return {
      success: true,
      deletedCount,
      freedSpace,
      retentionDays: IMAGE_RETENTION_DAYS
    };
  } catch (error) {
    console.error('[CleanupJob] Cleanup failed:', error);
    throw error;
  }
}



