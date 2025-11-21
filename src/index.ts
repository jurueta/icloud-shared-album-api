import express, { Request, Response } from 'express';
import cors from 'cors';
import { getImages } from 'icloud-shared-album';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS para que Angular (u otros fronts) puedan consumir la API
app.use(
  cors({
    origin: '*', // si quieres, luego restringes a tu dominio Angular
  })
);

// Cache simple en memoria
type CacheEntry = { at: number; data: any };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 2 * 60 * 1000; // 2 minutos

async function fetchAlbum(token: string) {
  const key = `album:${token}`;
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return hit.data;
  }

  const data = await getImages(token); // llamada a iCloud
  CACHE.set(key, { at: now, data });
  return data;
}

// Endpoint: info básica del álbum
app.get('/api/album/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const album = await fetchAlbum(token);
    const { title, items } = album;

    res.json({
      token,
      title,
      count: items?.length ?? 0,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'Error al obtener el álbum' });
  }
});

// Endpoint: lista paginada de items
app.get('/api/album/:token/items', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const page = Number(req.query.page ?? null);
      const size = Number(req.query.size ?? null);
      var photosPage: any[] = [];

      const isPageInvalid = req.query.page !== undefined && (isNaN(page) || page < 1);
      const isSizeInvalid = req.query.size !== undefined && (isNaN(size) || size < 1);

      if (isPageInvalid || isSizeInvalid) {
        res.status(400).json({ error: 'Parámetros de paginación inválidos' });
        return;
      }

      const { photos = [] } = await fetchAlbum(token);

      if (page === 0 && size === 0) {
        photosPage = photos;
      }else {
        const start = (page - 1) * size;
        photosPage = photos.slice(start, start + size);
      }
  
      const items = photosPage.map((photo: any) => {
        const derivatives = photo.derivatives || {};
        const keys = Object.keys(derivatives);
  
        // elige un derivado “grande” para mostrar
        const bestKey = keys.sort((a, b) => {
          const ha = derivatives[a]?.height ?? Number(a);
          const hb = derivatives[b]?.height ?? Number(b);
          return ha - hb;
        }).pop();
  
        const best = bestKey ? derivatives[bestKey] : undefined;
        const thumb = keys[0] ? derivatives[keys[0]] : best;
  
        return {
          id: photo.photoGuid,
          createdAt: photo.creationDate,
          type: photo.mediaAssetType || photo.mediaType || 'image',
          thumbUrl: thumb?.url || null,
          mediaUrl: best?.url || thumb?.url || null,
          filename: photo.filename,
          width: best?.width,
          height: best?.height,
        };
      });
  
      res.json({
        page,
        size,
        total: photos.length,
        items,
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e?.message || 'Error al obtener items' });
    }
});
  

// Arrancar servidor
app.listen(PORT, () => {
  console.log(`iCloud Album API listening on http://localhost:${PORT}`);
});
