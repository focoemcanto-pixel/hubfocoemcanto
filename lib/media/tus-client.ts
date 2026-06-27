export const DEFAULT_TUS_CHUNK_SIZE = 8 * 1024 * 1024;

export async function uploadFileWithTus(uploadUrl: string, file: File, onProgress: (progress: number) => void, chunkSize = DEFAULT_TUS_CHUNK_SIZE) {
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, end);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', uploadUrl);
      xhr.setRequestHeader('Tus-Resumable', '1.0.0');
      xhr.setRequestHeader('Upload-Offset', String(offset));
      xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error((xhr.responseText || '').trim() || `Chunk TUS falhou (${xhr.status}).`));
          return;
        }
        const nextOffset = Number(xhr.getResponseHeader('Upload-Offset') || end);
        if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
          reject(new Error('Cloudflare não confirmou o avanço do upload TUS.'));
          return;
        }
        offset = Math.min(nextOffset, file.size);
        onProgress(Math.round((offset / file.size) * 100));
        resolve();
      };
      xhr.onerror = () => reject(new Error('Conexão caiu durante um chunk do upload TUS para o Cloudflare Stream.'));
      xhr.ontimeout = () => reject(new Error('Tempo limite durante um chunk do upload TUS para o Cloudflare Stream.'));
      xhr.send(chunk);
    });
  }
}
