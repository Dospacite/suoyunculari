import type { APIRoute } from 'astro';
import { deleteLocalPdfDocument, renameLocalPdfDocument } from '@/lib/local-documents';
import { getUser, handleError, json, readJson } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    getUser(context);
    const document = await renameLocalPdfDocument(String(context.params.id || ''), String((await readJson(context)).title || ''));
    return json({ document });
  } catch (error) {
    return handleError(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    getUser(context);
    await deleteLocalPdfDocument(String(context.params.id || ''));
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
