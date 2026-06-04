import type { APIRoute } from 'astro';
import { listLocalPdfDocuments, uploadLocalPdfDocument } from '@/lib/local-documents';
import { getUser, handleError, json } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    getUser(context);
    return json({ documents: await listLocalPdfDocuments() });
  } catch (error) {
    return handleError(error);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    getUser(context);
    const form = await context.request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('PDF file required.');
    const document = await uploadLocalPdfDocument(file);
    return json({ document }, 201);
  } catch (error) {
    return handleError(error);
  }
};
