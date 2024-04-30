import { Stats } from 'node:fs';
import { AssetType } from 'src/entities/asset.entity';
import { ExifEntity } from 'src/entities/exif.entity';
import {
  AudioCodec,
  Colorspace,
  ImageFormat,
  SystemConfigKey,
  ToneMapping,
  TranscodeHWAccel,
  TranscodePolicy,
  VideoCodec,
} from 'src/entities/system-config.entity';
import { IAssetRepository, WithoutProperty } from 'src/interfaces/asset.interface';
import { ICryptoRepository } from 'src/interfaces/crypto.interface';
import { IJobRepository, JobName, JobStatus } from 'src/interfaces/job.interface';
import { ILoggerRepository } from 'src/interfaces/logger.interface';
import { IMediaRepository } from 'src/interfaces/media.interface';
import { IMoveRepository } from 'src/interfaces/move.interface';
import { IPersonRepository } from 'src/interfaces/person.interface';
import { IStorageRepository } from 'src/interfaces/storage.interface';
import { ISystemConfigRepository } from 'src/interfaces/system-config.interface';
import { MediaService } from 'src/services/media.service';
import { assetStub } from 'test/fixtures/asset.stub';
import { faceStub } from 'test/fixtures/face.stub';
import { probeStub } from 'test/fixtures/media.stub';
import { personStub } from 'test/fixtures/person.stub';
import { newAssetRepositoryMock } from 'test/repositories/asset.repository.mock';
import { newCryptoRepositoryMock } from 'test/repositories/crypto.repository.mock';
import { newJobRepositoryMock } from 'test/repositories/job.repository.mock';
import { newLoggerRepositoryMock } from 'test/repositories/logger.repository.mock';
import { newMediaRepositoryMock } from 'test/repositories/media.repository.mock';
import { newMoveRepositoryMock } from 'test/repositories/move.repository.mock';
import { newPersonRepositoryMock } from 'test/repositories/person.repository.mock';
import { newStorageRepositoryMock } from 'test/repositories/storage.repository.mock';
import { newSystemConfigRepositoryMock } from 'test/repositories/system-config.repository.mock';
import { Mocked } from 'vitest';

describe(MediaService.name, () => {
  let sut: MediaService;
  let assetMock: Mocked<IAssetRepository>;
  let configMock: Mocked<ISystemConfigRepository>;
  let jobMock: Mocked<IJobRepository>;
  let mediaMock: Mocked<IMediaRepository>;
  let moveMock: Mocked<IMoveRepository>;
  let personMock: Mocked<IPersonRepository>;
  let storageMock: Mocked<IStorageRepository>;
  let cryptoMock: Mocked<ICryptoRepository>;
  let loggerMock: Mocked<ILoggerRepository>;

  beforeEach(() => {
    assetMock = newAssetRepositoryMock();
    configMock = newSystemConfigRepositoryMock();
    jobMock = newJobRepositoryMock();
    mediaMock = newMediaRepositoryMock();
    moveMock = newMoveRepositoryMock();
    personMock = newPersonRepositoryMock();
    storageMock = newStorageRepositoryMock();
    cryptoMock = newCryptoRepositoryMock();
    loggerMock = newLoggerRepositoryMock();

    sut = new MediaService(
      assetMock,
      personMock,
      jobMock,
      mediaMock,
      storageMock,
      configMock,
      moveMock,
      cryptoMock,
      loggerMock,
    );
  });

  it('should be defined', () => {
    expect(sut).toBeDefined();
  });

  describe('handleQueueGenerateThumbnails', () => {
    it('should queue all assets', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [assetStub.image],
        hasNextPage: false,
      });
      personMock.getAll.mockResolvedValue({
        items: [personStub.newThumbnail],
        hasNextPage: false,
      });
      personMock.getFacesByIds.mockResolvedValue([faceStub.face1]);

      await sut.handleQueueGenerateThumbnails({ force: true });

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(assetMock.getWithout).not.toHaveBeenCalled();
      expect(jobMock.queueAll).toHaveBeenCalledWith([
        {
          name: JobName.GENERATE_PREVIEW,
          data: { id: assetStub.image.id },
        },
      ]);

      expect(personMock.getAll).toHaveBeenCalledWith({ skip: 0, take: 1000 }, {});
      expect(jobMock.queueAll).toHaveBeenCalledWith([
        {
          name: JobName.GENERATE_PERSON_THUMBNAIL,
          data: { id: personStub.newThumbnail.id },
        },
      ]);
    });

    it('should queue all people with missing thumbnail path', async () => {
      assetMock.getWithout.mockResolvedValue({
        items: [assetStub.image],
        hasNextPage: false,
      });
      personMock.getAll.mockResolvedValue({
        items: [personStub.noThumbnail],
        hasNextPage: false,
      });
      personMock.getRandomFace.mockResolvedValue(faceStub.face1);

      await sut.handleQueueGenerateThumbnails({ force: false });

      expect(assetMock.getAll).not.toHaveBeenCalled();
      expect(assetMock.getWithout).toHaveBeenCalledWith({ skip: 0, take: 1000 }, WithoutProperty.THUMBNAIL);

      expect(personMock.getAll).toHaveBeenCalledWith({ skip: 0, take: 1000 }, { where: { thumbnailPath: '' } });
      expect(personMock.getRandomFace).toHaveBeenCalled();
      expect(jobMock.queueAll).toHaveBeenCalledWith([
        {
          name: JobName.GENERATE_PERSON_THUMBNAIL,
          data: {
            id: personStub.newThumbnail.id,
          },
        },
      ]);
    });

    it('should queue all assets with missing resize path', async () => {
      assetMock.getWithout.mockResolvedValue({
        items: [assetStub.noResizePath],
        hasNextPage: false,
      });
      personMock.getAll.mockResolvedValue({
        items: [],
        hasNextPage: false,
      });

      await sut.handleQueueGenerateThumbnails({ force: false });

      expect(assetMock.getAll).not.toHaveBeenCalled();
      expect(assetMock.getWithout).toHaveBeenCalledWith({ skip: 0, take: 1000 }, WithoutProperty.THUMBNAIL);
      expect(jobMock.queueAll).toHaveBeenCalledWith([
        {
          name: JobName.GENERATE_PREVIEW,
          data: { id: assetStub.image.id },
        },
      ]);

      expect(personMock.getAll).toHaveBeenCalledWith({ skip: 0, take: 1000 }, { where: { thumbnailPath: '' } });
    });

    it('should queue all assets with missing webp path', async () => {
      assetMock.getWithout.mockResolvedValue({
        items: [assetStub.noWebpPath],
        hasNextPage: false,
      });
      personMock.getAll.mockResolvedValue({
        items: [],
        hasNextPage: false,
      });

      await sut.handleQueueGenerateThumbnails({ force: false });

      expect(assetMock.getAll).not.toHaveBeenCalled();
      expect(assetMock.getWithout).toHaveBeenCalledWith({ skip: 0, take: 1000 }, WithoutProperty.THUMBNAIL);
      expect(jobMock.queueAll).toHaveBeenCalledWith([
        {
          name: JobName.GENERATE_THUMBNAIL,
          data: { id: assetStub.image.id },
        },
      ]);

      expect(personMock.getAll).toHaveBeenCalledWith({ skip: 0, take: 1000 }, { where: { thumbnailPath: '' } });
    });

    it('should queue all assets with missing thumbhash', async () => {
      assetMock.getWithout.mockResolvedValue({
        items: [assetStub.noThumbhash],
        hasNextPage: false,
      });
      personMock.getAll.mockResolvedValue({
        items: [],
        hasNextPage: false,
      });

      await sut.handleQueueGenerateThumbnails({ force: false });

      expect(assetMock.getAll).not.toHaveBeenCalled();
      expect(assetMock.getWithout).toHaveBeenCalledWith({ skip: 0, take: 1000 }, WithoutProperty.THUMBNAIL);
      expect(jobMock.queueAll).toHaveBeenCalledWith([
        {
          name: JobName.GENERATE_THUMBHASH,
          data: { id: assetStub.image.id },
        },
      ]);

      expect(personMock.getAll).toHaveBeenCalledWith({ skip: 0, take: 1000 }, { where: { thumbnailPath: '' } });
    });
  });

  describe('handleGeneratePreview', () => {
    it('should skip thumbnail generation if asset not found', async () => {
      assetMock.getByIds.mockResolvedValue([]);
      await sut.handleGeneratePreview({ id: assetStub.image.id });
      expect(mediaMock.resize).not.toHaveBeenCalled();
      expect(assetMock.update).not.toHaveBeenCalledWith();
    });

    it('should skip video thumbnail generation if no video stream', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.noVideoStreams);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleGeneratePreview({ id: assetStub.image.id });
      expect(mediaMock.resize).not.toHaveBeenCalled();
      expect(assetMock.update).not.toHaveBeenCalledWith();
    });

    it('should skip invisible assets', async () => {
      assetMock.getByIds.mockResolvedValue([assetStub.livePhotoMotionAsset]);

      expect(await sut.handleGeneratePreview({ id: assetStub.livePhotoMotionAsset.id })).toEqual(JobStatus.SKIPPED);

      expect(mediaMock.resize).not.toHaveBeenCalled();
      expect(assetMock.update).not.toHaveBeenCalledWith();
    });

    it.each(Object.values(ImageFormat))('should generate a %s preview for an image when specified', async (format) => {
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.IMAGE_PREVIEW_FORMAT, value: format }]);
      assetMock.getByIds.mockResolvedValue([assetStub.image]);
      const previewPath = `upload/thumbs/user-id/as/se/asset-id-preview.${format}`;

      await sut.handleGeneratePreview({ id: assetStub.image.id });

      expect(storageMock.mkdirSync).toHaveBeenCalledWith('upload/thumbs/user-id/as/se');
      expect(mediaMock.resize).toHaveBeenCalledWith('/original/path.jpg', previewPath, {
        size: 1440,
        format,
        quality: 80,
        colorspace: Colorspace.SRGB,
      });
      expect(assetMock.update).toHaveBeenCalledWith({ id: 'asset-id', previewPath });
    });

    it('should delete previous preview if different path', async () => {
      const previousPreviewPath = assetStub.image.previewPath;

      configMock.load.mockResolvedValue([{ key: SystemConfigKey.IMAGE_THUMBNAIL_FORMAT, value: ImageFormat.WEBP }]);
      assetMock.getByIds.mockResolvedValue([assetStub.image]);

      await sut.handleGeneratePreview({ id: assetStub.image.id });

      expect(storageMock.unlink).toHaveBeenCalledWith(previousPreviewPath);
    });

    it('should generate a P3 thumbnail for a wide gamut image', async () => {
      assetMock.getByIds.mockResolvedValue([
        { ...assetStub.image, exifInfo: { profileDescription: 'Adobe RGB', bitsPerSample: 14 } as ExifEntity },
      ]);
      await sut.handleGeneratePreview({ id: assetStub.image.id });

      expect(storageMock.mkdirSync).toHaveBeenCalledWith('upload/thumbs/user-id/as/se');
      expect(mediaMock.resize).toHaveBeenCalledWith(
        '/original/path.jpg',
        'upload/thumbs/user-id/as/se/asset-id-preview.jpeg',
        {
          size: 1440,
          format: ImageFormat.JPEG,
          quality: 80,
          colorspace: Colorspace.P3,
        },
      );
      expect(assetMock.update).toHaveBeenCalledWith({
        id: 'asset-id',
        previewPath: 'upload/thumbs/user-id/as/se/asset-id-preview.jpeg',
      });
    });

    it('should generate a thumbnail for a video', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStream2160p);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleGeneratePreview({ id: assetStub.video.id });

      expect(storageMock.mkdirSync).toHaveBeenCalledWith('upload/thumbs/user-id/as/se');
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/thumbs/user-id/as/se/asset-id-preview.jpeg',
        {
          inputOptions: ['-ss 00:00:00', '-sws_flags accurate_rnd+bitexact+full_chroma_int'],
          outputOptions: [
            '-frames:v 1',
            '-v verbose',
            '-vf scale=-2:1440:flags=lanczos+accurate_rnd+bitexact+full_chroma_int:out_color_matrix=601:out_range=pc,format=yuv420p',
          ],
          twoPass: false,
        },
      );
      expect(assetMock.update).toHaveBeenCalledWith({
        id: 'asset-id',
        previewPath: 'upload/thumbs/user-id/as/se/asset-id-preview.jpeg',
      });
    });

    it('should tonemap thumbnail for hdr video', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamHDR);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleGeneratePreview({ id: assetStub.video.id });

      expect(storageMock.mkdirSync).toHaveBeenCalledWith('upload/thumbs/user-id/as/se');
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/thumbs/user-id/as/se/asset-id-preview.jpeg',
        {
          inputOptions: ['-ss 00:00:00', '-sws_flags accurate_rnd+bitexact+full_chroma_int'],
          outputOptions: [
            '-frames:v 1',
            '-v verbose',
            '-vf zscale=t=linear:npl=100,tonemap=hable:desat=0,zscale=p=bt709:t=601:m=bt470bg:range=pc,format=yuv420p',
          ],
          twoPass: false,
        },
      );
      expect(assetMock.update).toHaveBeenCalledWith({
        id: 'asset-id',
        previewPath: 'upload/thumbs/user-id/as/se/asset-id-preview.jpeg',
      });
    });

    it('should always generate video thumbnail in one pass', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamHDR);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TWO_PASS, value: true },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '5000k' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleGeneratePreview({ id: assetStub.video.id });

      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/thumbs/user-id/as/se/asset-id-preview.jpeg',
        {
          inputOptions: ['-ss 00:00:00', '-sws_flags accurate_rnd+bitexact+full_chroma_int'],
          outputOptions: [
            '-frames:v 1',
            '-v verbose',
            '-vf zscale=t=linear:npl=100,tonemap=hable:desat=0,zscale=p=bt709:t=601:m=bt470bg:range=pc,format=yuv420p',
          ],
          twoPass: false,
        },
      );
    });

    it('should run successfully', async () => {
      assetMock.getByIds.mockResolvedValue([assetStub.image]);
      await sut.handleGeneratePreview({ id: assetStub.image.id });
    });
  });

  describe('handleGenerateThumbnail', () => {
    it('should skip thumbnail generation if asset not found', async () => {
      assetMock.getByIds.mockResolvedValue([]);
      await sut.handleGenerateThumbnail({ id: assetStub.image.id });
      expect(mediaMock.resize).not.toHaveBeenCalled();
      expect(assetMock.update).not.toHaveBeenCalledWith();
    });

    it('should skip invisible assets', async () => {
      assetMock.getByIds.mockResolvedValue([assetStub.livePhotoMotionAsset]);

      expect(await sut.handleGenerateThumbnail({ id: assetStub.livePhotoMotionAsset.id })).toEqual(JobStatus.SKIPPED);

      expect(mediaMock.resize).not.toHaveBeenCalled();
      expect(assetMock.update).not.toHaveBeenCalledWith();
    });

    it.each(Object.values(ImageFormat))(
      'should generate a %s thumbnail for an image when specified',
      async (format) => {
        configMock.load.mockResolvedValue([{ key: SystemConfigKey.IMAGE_THUMBNAIL_FORMAT, value: format }]);
        assetMock.getByIds.mockResolvedValue([assetStub.image]);
        const thumbnailPath = `upload/thumbs/user-id/as/se/asset-id-thumbnail.${format}`;

        await sut.handleGenerateThumbnail({ id: assetStub.image.id });

        expect(storageMock.mkdirSync).toHaveBeenCalledWith('upload/thumbs/user-id/as/se');
        expect(mediaMock.resize).toHaveBeenCalledWith('/original/path.jpg', thumbnailPath, {
          size: 250,
          format,
          quality: 80,
          colorspace: Colorspace.SRGB,
        });
        expect(assetMock.update).toHaveBeenCalledWith({ id: 'asset-id', thumbnailPath });
      },
    );

    it('should delete previous thumbnail if different path', async () => {
      const previousThumbnailPath = assetStub.image.thumbnailPath;

      configMock.load.mockResolvedValue([{ key: SystemConfigKey.IMAGE_THUMBNAIL_FORMAT, value: ImageFormat.WEBP }]);
      assetMock.getByIds.mockResolvedValue([assetStub.image]);

      await sut.handleGenerateThumbnail({ id: assetStub.image.id });

      expect(storageMock.unlink).toHaveBeenCalledWith(previousThumbnailPath);
    });
  });

  it('should generate a P3 thumbnail for a wide gamut image', async () => {
    assetMock.getByIds.mockResolvedValue([assetStub.imageDng]);
    await sut.handleGenerateThumbnail({ id: assetStub.image.id });

    expect(storageMock.mkdirSync).toHaveBeenCalledWith('upload/thumbs/user-id/as/se');
    expect(mediaMock.resize).toHaveBeenCalledWith(
      assetStub.imageDng.originalPath,
      'upload/thumbs/user-id/as/se/asset-id-thumbnail.webp',
      {
        format: ImageFormat.WEBP,
        size: 250,
        quality: 80,
        colorspace: Colorspace.P3,
      },
    );
    expect(assetMock.update).toHaveBeenCalledWith({
      id: 'asset-id',
      thumbnailPath: 'upload/thumbs/user-id/as/se/asset-id-thumbnail.webp',
    });
  });

  it('should extract embedded image if enabled and available', async () => {
    mediaMock.extract.mockResolvedValue(true);
    mediaMock.getImageDimensions.mockResolvedValue({ width: 3840, height: 2160 });
    configMock.load.mockResolvedValue([{ key: SystemConfigKey.IMAGE_EXTRACT_EMBEDDED, value: true }]);
    assetMock.getByIds.mockResolvedValue([assetStub.imageDng]);

    await sut.handleGenerateThumbnail({ id: assetStub.image.id });

    const extractedPath = mediaMock.extract.mock.calls.at(-1)?.[1].toString();
    expect(mediaMock.resize.mock.calls).toEqual([
      [
        extractedPath,
        'upload/thumbs/user-id/as/se/asset-id-thumbnail.webp',
        {
          format: ImageFormat.WEBP,
          size: 250,
          quality: 80,
          colorspace: Colorspace.P3,
        },
      ],
    ]);
    expect(extractedPath?.endsWith('.tmp')).toBe(true);
    expect(storageMock.unlink).toHaveBeenCalledWith(extractedPath);
  });

  it('should resize original image if embedded image is too small', async () => {
    mediaMock.extract.mockResolvedValue(true);
    mediaMock.getImageDimensions.mockResolvedValue({ width: 1000, height: 1000 });
    configMock.load.mockResolvedValue([{ key: SystemConfigKey.IMAGE_EXTRACT_EMBEDDED, value: true }]);
    assetMock.getByIds.mockResolvedValue([assetStub.imageDng]);

    await sut.handleGenerateThumbnail({ id: assetStub.image.id });

    expect(mediaMock.resize.mock.calls).toEqual([
      [
        assetStub.imageDng.originalPath,
        'upload/thumbs/user-id/as/se/asset-id-thumbnail.webp',
        {
          format: ImageFormat.WEBP,
          size: 250,
          quality: 80,
          colorspace: Colorspace.P3,
        },
      ],
    ]);
    const extractedPath = mediaMock.extract.mock.calls.at(-1)?.[1].toString();
    expect(extractedPath?.endsWith('.tmp')).toBe(true);
    expect(storageMock.unlink).toHaveBeenCalledWith(extractedPath);
  });

  it('should resize original image if embedded image not found', async () => {
    configMock.load.mockResolvedValue([{ key: SystemConfigKey.IMAGE_EXTRACT_EMBEDDED, value: true }]);
    assetMock.getByIds.mockResolvedValue([assetStub.imageDng]);

    await sut.handleGenerateThumbnail({ id: assetStub.image.id });

    expect(mediaMock.resize).toHaveBeenCalledWith(
      assetStub.imageDng.originalPath,
      'upload/thumbs/user-id/as/se/asset-id-thumbnail.webp',
      {
        format: ImageFormat.WEBP,
        size: 250,
        quality: 80,
        colorspace: Colorspace.P3,
      },
    );
    expect(mediaMock.getImageDimensions).not.toHaveBeenCalled();
  });

  it('should resize original image if embedded image extraction is not enabled', async () => {
    configMock.load.mockResolvedValue([{ key: SystemConfigKey.IMAGE_EXTRACT_EMBEDDED, value: false }]);
    assetMock.getByIds.mockResolvedValue([assetStub.imageDng]);

    await sut.handleGenerateThumbnail({ id: assetStub.image.id });

    expect(mediaMock.extract).not.toHaveBeenCalled();
    expect(mediaMock.resize).toHaveBeenCalledWith(
      assetStub.imageDng.originalPath,
      'upload/thumbs/user-id/as/se/asset-id-thumbnail.webp',
      {
        format: ImageFormat.WEBP,
        size: 250,
        quality: 80,
        colorspace: Colorspace.P3,
      },
    );
    expect(mediaMock.getImageDimensions).not.toHaveBeenCalled();
  });

  describe('handleGenerateThumbhash', () => {
    it('should skip thumbhash generation if asset not found', async () => {
      assetMock.getByIds.mockResolvedValue([]);
      await sut.handleGenerateThumbhash({ id: assetStub.image.id });
      expect(mediaMock.generateThumbhash).not.toHaveBeenCalled();
    });

    it('should skip thumbhash generation if resize path is missing', async () => {
      assetMock.getByIds.mockResolvedValue([assetStub.noResizePath]);
      await sut.handleGenerateThumbhash({ id: assetStub.noResizePath.id });
      expect(mediaMock.generateThumbhash).not.toHaveBeenCalled();
    });

    it('should skip invisible assets', async () => {
      assetMock.getByIds.mockResolvedValue([assetStub.livePhotoMotionAsset]);

      expect(await sut.handleGenerateThumbhash({ id: assetStub.livePhotoMotionAsset.id })).toEqual(JobStatus.SKIPPED);

      expect(mediaMock.generateThumbhash).not.toHaveBeenCalled();
      expect(assetMock.update).not.toHaveBeenCalledWith();
    });

    it('should generate a thumbhash', async () => {
      const thumbhashBuffer = Buffer.from('a thumbhash', 'utf8');
      assetMock.getByIds.mockResolvedValue([assetStub.image]);
      mediaMock.generateThumbhash.mockResolvedValue(thumbhashBuffer);

      await sut.handleGenerateThumbhash({ id: assetStub.image.id });

      expect(mediaMock.generateThumbhash).toHaveBeenCalledWith('/uploads/user-id/thumbs/path.jpg');
      expect(assetMock.update).toHaveBeenCalledWith({ id: 'asset-id', thumbhash: thumbhashBuffer });
    });
  });

  describe('handleQueueVideoConversion', () => {
    it('should queue all video assets', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [assetStub.video],
        hasNextPage: false,
      });
      personMock.getAll.mockResolvedValue({
        items: [],
        hasNextPage: false,
      });

      await sut.handleQueueVideoConversion({ force: true });

      expect(assetMock.getAll).toHaveBeenCalledWith({ skip: 0, take: 1000 }, { type: AssetType.VIDEO });
      expect(assetMock.getWithout).not.toHaveBeenCalled();
      expect(jobMock.queueAll).toHaveBeenCalledWith([
        {
          name: JobName.VIDEO_CONVERSION,
          data: { id: assetStub.video.id },
        },
      ]);
    });

    it('should queue all video assets without encoded videos', async () => {
      assetMock.getWithout.mockResolvedValue({
        items: [assetStub.video],
        hasNextPage: false,
      });

      await sut.handleQueueVideoConversion({});

      expect(assetMock.getAll).not.toHaveBeenCalled();
      expect(assetMock.getWithout).toHaveBeenCalledWith({ skip: 0, take: 1000 }, WithoutProperty.ENCODED_VIDEO);
      expect(jobMock.queueAll).toHaveBeenCalledWith([
        {
          name: JobName.VIDEO_CONVERSION,
          data: { id: assetStub.video.id },
        },
      ]);
    });
  });

  describe('handleVideoConversion', () => {
    beforeEach(() => {
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
    });

    it('should skip transcoding if asset not found', async () => {
      assetMock.getByIds.mockResolvedValue([]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.probe).not.toHaveBeenCalled();
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should skip transcoding if non-video asset', async () => {
      assetMock.getByIds.mockResolvedValue([assetStub.image]);
      await sut.handleVideoConversion({ id: assetStub.image.id });
      expect(mediaMock.probe).not.toHaveBeenCalled();
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should transcode the longest stream', async () => {
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      mediaMock.probe.mockResolvedValue(probeStub.multipleVideoStreams);

      await sut.handleVideoConversion({ id: assetStub.video.id });

      expect(mediaMock.probe).toHaveBeenCalledWith('/original/path.ext');
      expect(configMock.load).toHaveBeenCalled();
      expect(storageMock.mkdirSync).toHaveBeenCalled();
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should skip a video without any streams', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.noVideoStreams);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should skip a video without any height', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.noHeight);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should transcode when set to all', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.multipleVideoStreams);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.ALL }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a aac',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should transcode when optimal and too big', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStream2160p);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.OPTIMAL }]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should transcode when policy Bitrate and bitrate higher than max bitrate', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStream40Mbps);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.BITRATE },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '30M' },
      ]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
            '-maxrate 30M',
            '-bufsize 60M',
          ],
          twoPass: false,
        },
      );
    });

    it('should not scale resolution if no target resolution', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStream2160p);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.ALL },
        { key: SystemConfigKey.FFMPEG_TARGET_RESOLUTION, value: 'original' },
      ]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a aac',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should transcode with alternate scaling video is vertical', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVertical2160p);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.OPTIMAL }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=720:-2,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should always scale video if height is uneven', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamOddHeight);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.ALL },
        { key: SystemConfigKey.FFMPEG_TARGET_RESOLUTION, value: 'original' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a aac',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            `-vf scale=-2:354,format=yuv420p`,
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should always scale video if width is uneven', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamOddWidth);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.ALL },
        { key: SystemConfigKey.FFMPEG_TARGET_RESOLUTION, value: 'original' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a aac',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            `-vf scale=354:-2,format=yuv420p`,
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should copy video stream when video matches target', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.HEVC },
        { key: SystemConfigKey.FFMPEG_ACCEPTED_AUDIO_CODECS, value: [AudioCodec.AAC] },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v copy',
            '-c:a aac',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-tag:v hvc1',
            '-v verbose',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should not include hevc tag when target is hevc and video stream is copied from a different codec', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamH264);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.HEVC },
        { key: SystemConfigKey.FFMPEG_ACCEPTED_VIDEO_CODECS, value: [VideoCodec.H264, VideoCodec.HEVC] },
        { key: SystemConfigKey.FFMPEG_ACCEPTED_AUDIO_CODECS, value: [AudioCodec.AAC] },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v copy',
            '-c:a aac',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should include hevc tag when target is hevc and copying hevc video stream', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.HEVC },
        { key: SystemConfigKey.FFMPEG_ACCEPTED_VIDEO_CODECS, value: [VideoCodec.H264, VideoCodec.HEVC] },
        { key: SystemConfigKey.FFMPEG_ACCEPTED_AUDIO_CODECS, value: [AudioCodec.AAC] },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v copy',
            '-c:a aac',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-tag:v hvc1',
            '-v verbose',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should copy audio stream when audio matches target', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.audioStreamAac);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.OPTIMAL }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should transcode when container doesnt match target', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.OPTIMAL }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should throw an exception if transcode value is invalid', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStream2160p);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: 'invalid' }]);

      await expect(sut.handleVideoConversion({ id: assetStub.video.id })).rejects.toThrow();
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should not transcode if transcoding is disabled', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStream2160p);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.DISABLED }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should not transcode if target codec is invalid', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStream2160p);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: 'invalid' }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should delete existing transcode if current policy does not require transcoding', async () => {
      const asset = assetStub.hasEncodedVideo;
      mediaMock.probe.mockResolvedValue(probeStub.videoStream2160p);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.DISABLED }]);
      assetMock.getByIds.mockResolvedValue([asset]);

      await sut.handleVideoConversion({ id: asset.id });

      expect(mediaMock.transcode).not.toHaveBeenCalled();
      expect(jobMock.queue).toHaveBeenCalledWith({
        name: JobName.DELETE_FILES,
        data: { files: [asset.encodedVideoPath] },
      });
    });

    it('should set max bitrate if above 0', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '4500k' }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
            '-maxrate 4500k',
            '-bufsize 9000k',
          ],
          twoPass: false,
        },
      );
    });

    it('should transcode in two passes for h264/h265 when enabled and max bitrate is above 0', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '4500k' },
        { key: SystemConfigKey.FFMPEG_TWO_PASS, value: true },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-b:v 3104k',
            '-minrate 1552k',
            '-maxrate 4500k',
          ],
          twoPass: true,
        },
      );
    });

    it('should fallback to one pass for h264/h265 if two-pass is enabled but no max bitrate is set', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TWO_PASS, value: true }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should transcode by bitrate in two passes for vp9 when two pass mode and max bitrate are enabled', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '4500k' },
        { key: SystemConfigKey.FFMPEG_TWO_PASS, value: true },
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.VP9 },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v vp9',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-cpu-used 5',
            '-row-mt 1',
            '-b:v 3104k',
            '-minrate 1552k',
            '-maxrate 4500k',
          ],
          twoPass: true,
        },
      );
    });

    it('should transcode by crf in two passes for vp9 when two pass mode is enabled and max bitrate is disabled', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '0' },
        { key: SystemConfigKey.FFMPEG_TWO_PASS, value: true },
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.VP9 },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v vp9',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-cpu-used 5',
            '-row-mt 1',
            '-crf 23',
            '-b:v 0',
          ],
          twoPass: true,
        },
      );
    });

    it('should configure preset for vp9', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.VP9 },
        { key: SystemConfigKey.FFMPEG_PRESET, value: 'slow' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v vp9',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-cpu-used 2',
            '-row-mt 1',
            '-crf 23',
            '-b:v 0',
          ],
          twoPass: false,
        },
      );
    });

    it('should not configure preset for vp9 if invalid', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.VP9 },
        { key: SystemConfigKey.FFMPEG_PRESET, value: 'invalid' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v vp9',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-row-mt 1',
            '-crf 23',
            '-b:v 0',
          ],
          twoPass: false,
        },
      );
    });

    it('should configure threads if above 0', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.VP9 },
        { key: SystemConfigKey.FFMPEG_THREADS, value: 2 },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v vp9',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-cpu-used 5',
            '-row-mt 1',
            '-threads 2',
            '-crf 23',
            '-b:v 0',
          ],
          twoPass: false,
        },
      );
    });

    it('should disable thread pooling for h264 if thread limit is 1', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_THREADS, value: 1 }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-threads 1',
            '-x264-params frame-threads=1:pools=none',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should omit thread flags for h264 if thread limit is at or below 0', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_THREADS, value: 0 }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should disable thread pooling for hevc if thread limit is 1', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVp9);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_THREADS, value: 1 },
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.HEVC },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v hevc',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-tag:v hvc1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-threads 1',
            '-x265-params frame-threads=1:pools=none',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should omit thread flags for hevc if thread limit is at or below 0', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVp9);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_THREADS, value: 0 },
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.HEVC },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v hevc',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-tag:v hvc1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should use av1 if specified', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVp9);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.AV1 }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v av1',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset 12',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should map `veryslow` preset to 4 for av1', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVp9);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.AV1 },
        { key: SystemConfigKey.FFMPEG_PRESET, value: 'veryslow' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v av1',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset 4',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should set max bitrate for av1 if specified', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVp9);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.AV1 },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '2M' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v av1',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset 12',
            '-crf 23',
            '-svtav1-params mbr=2M',
          ],
          twoPass: false,
        },
      );
    });

    it('should set threads for av1 if specified', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVp9);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.AV1 },
        { key: SystemConfigKey.FFMPEG_THREADS, value: 4 },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v av1',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset 12',
            '-crf 23',
            '-svtav1-params lp=4',
          ],
          twoPass: false,
        },
      );
    });

    it('should set both bitrate and threads for av1 if specified', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVp9);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.AV1 },
        { key: SystemConfigKey.FFMPEG_THREADS, value: 4 },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '2M' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v av1',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset 12',
            '-crf 23',
            '-svtav1-params lp=4:mbr=2M',
          ],
          twoPass: false,
        },
      );
    });

    it('should skip transcoding for audioless videos with optimal policy if video codec is correct', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.noAudioStreams);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.HEVC },
        { key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.OPTIMAL },
        { key: SystemConfigKey.FFMPEG_TARGET_RESOLUTION, value: '1080p' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should fail if hwaccel is enabled for an unsupported codec', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.NVENC },
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.VP9 },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await expect(sut.handleVideoConversion({ id: assetStub.video.id })).resolves.toBe(JobStatus.FAILED);
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should fail if hwaccel option is invalid', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_ACCEL, value: 'invalid' }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await expect(sut.handleVideoConversion({ id: assetStub.video.id })).resolves.toBe(JobStatus.FAILED);
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should set two pass options for nvenc when enabled', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.NVENC },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '10000k' },
        { key: SystemConfigKey.FFMPEG_TWO_PASS, value: true },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device cuda=cuda:0', '-filter_hw_device cuda'],
          outputOptions: [
            '-tune hq',
            '-qmin 0',
            '-rc-lookahead 20',
            '-i_qfactor 0.75',
            `-c:v h264_nvenc`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload_cuda,scale_cuda=-2:720',
            '-preset p1',
            '-b:v 6897k',
            '-maxrate 10000k',
            '-bufsize 6897k',
            '-multipass 2',
          ],
          twoPass: false,
        },
      );
    });

    it('should set vbr options for nvenc when max bitrate is enabled', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.NVENC },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '10000k' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device cuda=cuda:0', '-filter_hw_device cuda'],
          outputOptions: [
            '-tune hq',
            '-qmin 0',
            '-rc-lookahead 20',
            '-i_qfactor 0.75',
            `-c:v h264_nvenc`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload_cuda,scale_cuda=-2:720',
            '-preset p1',
            '-cq:v 23',
            '-maxrate 10000k',
            '-bufsize 6897k',
          ],
          twoPass: false,
        },
      );
    });

    it('should set cq options for nvenc when max bitrate is disabled', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.NVENC }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device cuda=cuda:0', '-filter_hw_device cuda'],
          outputOptions: [
            '-tune hq',
            '-qmin 0',
            '-rc-lookahead 20',
            '-i_qfactor 0.75',
            `-c:v h264_nvenc`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload_cuda,scale_cuda=-2:720',
            '-preset p1',
            '-cq:v 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should omit preset for nvenc if invalid', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.NVENC },
        { key: SystemConfigKey.FFMPEG_PRESET, value: 'invalid' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device cuda=cuda:0', '-filter_hw_device cuda'],
          outputOptions: [
            '-tune hq',
            '-qmin 0',
            '-rc-lookahead 20',
            '-i_qfactor 0.75',
            `-c:v h264_nvenc`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload_cuda,scale_cuda=-2:720',
            '-cq:v 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should ignore two pass for nvenc if max bitrate is disabled', async () => {
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.NVENC }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device cuda=cuda:0', '-filter_hw_device cuda'],
          outputOptions: [
            '-tune hq',
            '-qmin 0',
            '-rc-lookahead 20',
            '-i_qfactor 0.75',
            `-c:v h264_nvenc`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload_cuda,scale_cuda=-2:720',
            '-preset p1',
            '-cq:v 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should set options for qsv', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.QSV },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '10000k' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device qsv=hw', '-filter_hw_device hw'],
          outputOptions: [
            `-c:v h264_qsv`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-bf 7',
            '-refs 5',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload=extra_hw_frames=64,scale_qsv=-1:720',
            '-preset 7',
            '-global_quality 23',
            '-maxrate 10000k',
            '-bufsize 20000k',
          ],
          twoPass: false,
        },
      );
    });

    it('should set options for qsv with custom dri node', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.QSV },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '10000k' },
        { key: SystemConfigKey.FFMPEG_PREFERRED_HW_DEVICE, value: '/dev/dri/renderD128' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device qsv=hw,child_device=/dev/dri/renderD128', '-filter_hw_device hw'],
          outputOptions: [
            `-c:v h264_qsv`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-bf 7',
            '-refs 5',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload=extra_hw_frames=64,scale_qsv=-1:720',
            '-preset 7',
            '-global_quality 23',
            '-maxrate 10000k',
            '-bufsize 20000k',
          ],
          twoPass: false,
        },
      );
    });

    it('should omit preset for qsv if invalid', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.QSV },
        { key: SystemConfigKey.FFMPEG_PRESET, value: 'invalid' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device qsv=hw', '-filter_hw_device hw'],
          outputOptions: [
            `-c:v h264_qsv`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-bf 7',
            '-refs 5',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload=extra_hw_frames=64,scale_qsv=-1:720',
            '-global_quality 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should set low power mode for qsv if target video codec is vp9', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.QSV },
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.VP9 },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device qsv=hw', '-filter_hw_device hw'],
          outputOptions: [
            `-c:v vp9_qsv`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-bf 7',
            '-refs 5',
            '-g 256',
            '-low_power 1',
            '-v verbose',
            '-vf format=nv12,hwupload=extra_hw_frames=64,scale_qsv=-1:720',
            '-preset 7',
            '-q:v 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should fail for qsv if no hw devices', async () => {
      storageMock.readdir.mockResolvedValue([]);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.QSV }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await expect(sut.handleVideoConversion({ id: assetStub.video.id })).resolves.toBe(JobStatus.FAILED);
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should set vbr options for vaapi when max bitrate is enabled', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.VAAPI },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '10000k' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device vaapi=accel:/dev/dri/renderD128', '-filter_hw_device accel'],
          outputOptions: [
            `-c:v h264_vaapi`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload,scale_vaapi=-2:720',
            '-compression_level 7',
            '-b:v 6897k',
            '-maxrate 10000k',
            '-minrate 3448.5k',
            '-rc_mode 3',
          ],
          twoPass: false,
        },
      );
    });

    it('should set cq options for vaapi when max bitrate is disabled', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.VAAPI }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device vaapi=accel:/dev/dri/renderD128', '-filter_hw_device accel'],
          outputOptions: [
            `-c:v h264_vaapi`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload,scale_vaapi=-2:720',
            '-compression_level 7',
            '-qp 23',
            '-global_quality 23',
            '-rc_mode 1',
          ],
          twoPass: false,
        },
      );
    });

    it('should omit preset for vaapi if invalid', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.VAAPI },
        { key: SystemConfigKey.FFMPEG_PRESET, value: 'invalid' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device vaapi=accel:/dev/dri/renderD128', '-filter_hw_device accel'],
          outputOptions: [
            `-c:v h264_vaapi`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload,scale_vaapi=-2:720',
            '-qp 23',
            '-global_quality 23',
            '-rc_mode 1',
          ],
          twoPass: false,
        },
      );
    });

    it('should prefer gpu for vaapi if available', async () => {
      storageMock.readdir.mockResolvedValue(['renderD129', 'card1', 'card0', 'renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.VAAPI }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device vaapi=accel:/dev/dri/card1', '-filter_hw_device accel'],
          outputOptions: [
            `-c:v h264_vaapi`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload,scale_vaapi=-2:720',
            '-compression_level 7',
            '-qp 23',
            '-global_quality 23',
            '-rc_mode 1',
          ],
          twoPass: false,
        },
      );

      storageMock.readdir.mockResolvedValue(['renderD129', 'renderD128']);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device vaapi=accel:/dev/dri/renderD129', '-filter_hw_device accel'],
          outputOptions: [
            `-c:v h264_vaapi`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload,scale_vaapi=-2:720',
            '-compression_level 7',
            '-qp 23',
            '-global_quality 23',
            '-rc_mode 1',
          ],
          twoPass: false,
        },
      );
    });

    it('should select specific gpu node if selected', async () => {
      storageMock.readdir.mockResolvedValue(['renderD129', 'card1', 'card0', 'renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.VAAPI },
        { key: SystemConfigKey.FFMPEG_PREFERRED_HW_DEVICE, value: '/dev/dri/renderD128' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-init_hw_device vaapi=accel:/dev/dri/renderD128', '-filter_hw_device accel'],
          outputOptions: [
            `-c:v h264_vaapi`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf format=nv12,hwupload,scale_vaapi=-2:720',
            '-compression_level 7',
            '-qp 23',
            '-global_quality 23',
            '-rc_mode 1',
          ],
          twoPass: false,
        },
      );
    });

    it('should fallback to sw transcoding if hw transcoding fails', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.VAAPI }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      mediaMock.transcode.mockRejectedValueOnce(new Error('error'));
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledTimes(2);
      expect(mediaMock.transcode).toHaveBeenLastCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: [],
          outputOptions: [
            '-c:v h264',
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-v verbose',
            '-vf scale=-2:720,format=yuv420p',
            '-preset ultrafast',
            '-crf 23',
          ],
          twoPass: false,
        },
      );
    });

    it('should fail for vaapi if no hw devices', async () => {
      storageMock.readdir.mockResolvedValue([]);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.VAAPI }]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await expect(sut.handleVideoConversion({ id: assetStub.video.id })).resolves.toBe(JobStatus.FAILED);
      expect(mediaMock.transcode).not.toHaveBeenCalled();
    });

    it('should set vbr options for rkmpp when max bitrate is enabled', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamVp9);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.RKMPP },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '10000k' },
        { key: SystemConfigKey.FFMPEG_TARGET_VIDEO_CODEC, value: VideoCodec.HEVC },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-hwaccel rkmpp', '-hwaccel_output_format drm_prime', '-afbc rga'],
          outputOptions: [
            `-c:v hevc_rkmpp`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-tag:v hvc1',
            '-v verbose',
            '-vf scale_rkrga=-2:720:format=nv12:afbc=1',
            '-level 153',
            '-rc_mode AVBR',
            '-b:v 10000k',
          ],
          twoPass: false,
        },
      );
    });

    it('should set cqp options for rkmpp when max bitrate is disabled', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      mediaMock.probe.mockResolvedValue(probeStub.matroskaContainer);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.RKMPP },
        { key: SystemConfigKey.FFMPEG_CRF, value: 30 },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '0' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-hwaccel rkmpp', '-hwaccel_output_format drm_prime', '-afbc rga'],
          outputOptions: [
            `-c:v h264_rkmpp`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf scale_rkrga=-2:720:format=nv12:afbc=1',
            '-level 51',
            '-rc_mode CQP',
            '-qp_init 30',
          ],
          twoPass: false,
        },
      );
    });

    it('should set OpenCL tonemapping options for rkmpp when OpenCL is available', async () => {
      storageMock.readdir.mockResolvedValue(['renderD128']);
      storageMock.stat.mockResolvedValue({ ...new Stats(), isFile: () => true, isCharacterDevice: () => true });
      mediaMock.probe.mockResolvedValue(probeStub.videoStreamHDR);
      configMock.load.mockResolvedValue([
        { key: SystemConfigKey.FFMPEG_ACCEL, value: TranscodeHWAccel.RKMPP },
        { key: SystemConfigKey.FFMPEG_CRF, value: 30 },
        { key: SystemConfigKey.FFMPEG_MAX_BITRATE, value: '0' },
      ]);
      assetMock.getByIds.mockResolvedValue([assetStub.video]);
      await sut.handleVideoConversion({ id: assetStub.video.id });
      expect(mediaMock.transcode).toHaveBeenCalledWith(
        '/original/path.ext',
        'upload/encoded-video/user-id/as/se/asset-id.mp4',
        {
          inputOptions: ['-hwaccel rkmpp', '-hwaccel_output_format drm_prime', '-afbc rga'],
          outputOptions: [
            `-c:v h264_rkmpp`,
            '-c:a copy',
            '-movflags faststart',
            '-fps_mode passthrough',
            '-map 0:0',
            '-map 0:1',
            '-g 256',
            '-v verbose',
            '-vf scale_rkrga=-2:720:format=p010:afbc=1,hwmap=derive_device=opencl:mode=read,tonemap_opencl=format=nv12:r=pc:p=bt709:t=bt709:m=bt709:tonemap=hable:desat=0,hwmap=derive_device=rkmpp:mode=write:reverse=1,format=drm_prime',
            '-level 51',
            '-rc_mode CQP',
            '-qp_init 30',
          ],
          twoPass: false,
        },
      );
    });
  });

  it('should tonemap when policy is required and video is hdr', async () => {
    mediaMock.probe.mockResolvedValue(probeStub.videoStreamHDR);
    configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.REQUIRED }]);
    assetMock.getByIds.mockResolvedValue([assetStub.video]);
    await sut.handleVideoConversion({ id: assetStub.video.id });
    expect(mediaMock.transcode).toHaveBeenCalledWith(
      '/original/path.ext',
      'upload/encoded-video/user-id/as/se/asset-id.mp4',
      {
        inputOptions: [],
        outputOptions: [
          '-c:v h264',
          '-c:a copy',
          '-movflags faststart',
          '-fps_mode passthrough',
          '-map 0:0',
          '-map 0:1',
          '-v verbose',
          '-vf zscale=t=linear:npl=100,tonemap=hable:desat=0,zscale=p=bt709:t=bt709:m=bt709:range=pc,format=yuv420p',
          '-preset ultrafast',
          '-crf 23',
        ],
        twoPass: false,
      },
    );
  });

  it('should tonemap when policy is optimal and video is hdr', async () => {
    mediaMock.probe.mockResolvedValue(probeStub.videoStreamHDR);
    configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TRANSCODE, value: TranscodePolicy.OPTIMAL }]);
    assetMock.getByIds.mockResolvedValue([assetStub.video]);
    await sut.handleVideoConversion({ id: assetStub.video.id });
    expect(mediaMock.transcode).toHaveBeenCalledWith(
      '/original/path.ext',
      'upload/encoded-video/user-id/as/se/asset-id.mp4',
      {
        inputOptions: [],
        outputOptions: [
          '-c:v h264',
          '-c:a copy',
          '-movflags faststart',
          '-fps_mode passthrough',
          '-map 0:0',
          '-map 0:1',
          '-v verbose',
          '-vf zscale=t=linear:npl=100,tonemap=hable:desat=0,zscale=p=bt709:t=bt709:m=bt709:range=pc,format=yuv420p',
          '-preset ultrafast',
          '-crf 23',
        ],
        twoPass: false,
      },
    );
  });

  it('should set npl to 250 for reinhard and mobius tone-mapping algorithms', async () => {
    mediaMock.probe.mockResolvedValue(probeStub.videoStreamHDR);
    configMock.load.mockResolvedValue([{ key: SystemConfigKey.FFMPEG_TONEMAP, value: ToneMapping.MOBIUS }]);
    assetMock.getByIds.mockResolvedValue([assetStub.video]);
    await sut.handleVideoConversion({ id: assetStub.video.id });
    expect(mediaMock.transcode).toHaveBeenCalledWith(
      '/original/path.ext',
      'upload/encoded-video/user-id/as/se/asset-id.mp4',
      {
        inputOptions: [],
        outputOptions: [
          '-c:v h264',
          '-c:a copy',
          '-movflags faststart',
          '-fps_mode passthrough',
          '-map 0:0',
          '-map 0:1',
          '-v verbose',
          '-vf zscale=t=linear:npl=250,tonemap=mobius:desat=0,zscale=p=bt709:t=bt709:m=bt709:range=pc,format=yuv420p',
          '-preset ultrafast',
          '-crf 23',
        ],
        twoPass: false,
      },
    );
  });

  describe('isSRGB', () => {
    it('should return true for srgb colorspace', () => {
      const asset = { ...assetStub.image, exifInfo: { colorspace: 'sRGB' } as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(true);
    });

    it('should return true for srgb profile description', () => {
      const asset = { ...assetStub.image, exifInfo: { profileDescription: 'sRGB v1.31' } as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(true);
    });

    it('should return true for 8-bit image with no colorspace metadata', () => {
      const asset = { ...assetStub.image, exifInfo: { bitsPerSample: 8 } as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(true);
    });

    it('should return true for image with no colorspace or bit depth metadata', () => {
      const asset = { ...assetStub.image, exifInfo: {} as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(true);
    });

    it('should return false for non-srgb colorspace', () => {
      const asset = { ...assetStub.image, exifInfo: { colorspace: 'Adobe RGB' } as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(false);
    });

    it('should return false for non-srgb profile description', () => {
      const asset = { ...assetStub.image, exifInfo: { profileDescription: 'sP3C' } as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(false);
    });

    it('should return false for 16-bit image with no colorspace metadata', () => {
      const asset = { ...assetStub.image, exifInfo: { bitsPerSample: 16 } as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(false);
    });

    it('should return true for 16-bit image with sRGB colorspace', () => {
      const asset = { ...assetStub.image, exifInfo: { colorspace: 'sRGB', bitsPerSample: 16 } as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(true);
    });

    it('should return true for 16-bit image with sRGB profile', () => {
      const asset = { ...assetStub.image, exifInfo: { profileDescription: 'sRGB', bitsPerSample: 16 } as ExifEntity };
      expect(sut.isSRGB(asset)).toEqual(true);
    });
  });
});
