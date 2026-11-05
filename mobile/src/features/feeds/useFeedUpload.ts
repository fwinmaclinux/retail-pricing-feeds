import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ApiError } from '@/api/client';
import { feedsApi, uploadFeedContent } from '@/api/endpoints';
import { useUser } from '@/auth/SessionProvider';
import { config } from '@/config';
import { formatBytes } from '@/utils/format';
import { previewCsv, type CsvPreview } from './csvPreview';

export interface PickedFile {
  name: string;
  sizeBytes: number;
  text: string;
}

export type UploadState =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'ready'; file: PickedFile; preview: CsvPreview }
  | { step: 'uploading'; file: PickedFile; preview: CsvPreview; progress: number }
  | { step: 'duplicate'; file: PickedFile; feedId: string }
  | { step: 'error'; message: string; file?: PickedFile; preview?: CsvPreview };

const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];

/**
 * Upload flow: pick -> pre-check on device -> register (SHA-256 for idempotency) ->
 * PUT bytes with progress -> hand over to the feed status screen.
 */
export function useFeedUpload(knownStoreIds: Set<string> | undefined, onUploaded: (feedId: string) => void) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>({ step: 'idle' });
  const cancelRef = useRef<(() => void) | null>(null);

  const loadText = useCallback(
    (name: string, text: string, sizeBytes: number) => {
      const file = { name, text, sizeBytes };
      setState({ step: 'ready', file, preview: previewCsv(text, { knownStoreIds }) });
    },
    [knownStoreIds],
  );

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: CSV_TYPES, copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0]!;
    if (!/\.csv$/i.test(asset.name)) {
      setState({ step: 'error', message: `"${asset.name}" is not a .csv file. Export the feed as CSV and try again.` });
      return;
    }
    if ((asset.size ?? 0) > config.maxUploadBytes) {
      setState({ step: 'error', message: `This file is ${formatBytes(asset.size!)}. Feeds are limited to ${formatBytes(config.maxUploadBytes)}.` });
      return;
    }
    setState({ step: 'reading' });
    try {
      const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      loadText(asset.name, text, asset.size ?? text.length);
    } catch {
      setState({ step: 'error', message: "Couldn't read that file. Make sure it's downloaded to the device." });
    }
  }, [loadText]);

  const upload = useCallback(async () => {
    if (state.step !== 'ready') return;
    const { file, preview } = state;
    setState({ step: 'uploading', file, preview, progress: 0 });
    try {
      const checksumSha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, file.text);
      const created = await feedsApi.create({ fileName: file.name, sizeBytes: file.sizeBytes, checksumSha256 });
      if (!created.upload) {
        setState({ step: 'duplicate', file, feedId: created.duplicateOf ?? created.feed.feedId });
        return;
      }
      const task = uploadFeedContent(created.upload, file.text, (progress) =>
        setState((s) => (s.step === 'uploading' ? { ...s, progress } : s)),
      );
      cancelRef.current = task.cancel;
      const feed = await task.promise;
      void queryClient.invalidateQueries({ queryKey: ['feeds', user.userId] });
      setState({ step: 'idle' });
      onUploaded(feed.feedId);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CANCELLED') {
        setState({ step: 'ready', file, preview });
        return;
      }
      if (err instanceof ApiError && err.code === 'DUPLICATE_FEED' && typeof err.body.duplicateOf === 'string') {
        setState({ step: 'duplicate', file, feedId: err.body.duplicateOf });
        return;
      }
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Upload failed', file, preview });
    } finally {
      cancelRef.current = null;
    }
  }, [state, queryClient, user.userId, onUploaded]);

  return {
    state,
    pickFile,
    loadText,
    upload,
    cancel: () => cancelRef.current?.(),
    reset: () => setState({ step: 'idle' }),
    retry: () => {
      if (state.step === 'error' && state.file && state.preview) setState({ step: 'ready', file: state.file, preview: state.preview });
      else setState({ step: 'idle' });
    },
  };
}
