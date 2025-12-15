import { respondWithJSON } from './json';
import { getVideo, updateVideo } from '../db/videos';
import { type ApiConfig } from '../config';
import type { BunRequest } from 'bun';
import { BadRequestError, NotFoundError, UserForbiddenError } from './errors';
import { getBearerToken, validateJWT } from '../auth';
import type { UUID } from 'crypto';
import { getAssetDiskPath, mediaTypeToExt } from './assets';
import { randomBytes } from 'crypto';

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: UUID };
  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError('Not authorized to update this video');
  }

  const formData = await req.formData();
  const file = formData.get('video');
  if (!(file instanceof File)) {
    throw new BadRequestError('Video file missing');
  }

  const MAX_UPLOAD_SIZE = 1 << 30;

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(
      `Thumbnail file exceeds the maximum allowed size of 10MB`
    );
  }

  const mediaType = file.type;
  if (mediaType !== 'video/mp4' && mediaType !== 'video/webm') {
    throw new BadRequestError('Invalid file type. Only MP4 or WEBM allowed.');
  }

  const ext = mediaTypeToExt(mediaType);
  const videoName = randomBytes(32).toString('hex');
  const filename = `${videoName}${ext}`;

  await cfg.s3Client.write(filename, file, {
    type: mediaType,
  });

  video.videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${filename}`;

  updateVideo(cfg.db, video);

  return respondWithJSON(200, null);
}
