type DailyRoomPayload = {
  name: string;
  privacy?: 'public' | 'private';
  properties?: Record<string, unknown>;
};

function dailyHeaders() {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) throw new Error('DAILY_API_KEY não configurada no ambiente.');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export async function createDailyRoom(payload: DailyRoomPayload) {
  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: dailyHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Falha ao criar sala na Daily: ${response.status} ${detail}`);
  }

  return response.json() as Promise<{ id: string; name: string; url: string }>;
}

export async function deleteDailyRoom(roomName: string) {
  const response = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
    method: 'DELETE',
    headers: dailyHeaders(),
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text();
    throw new Error(`Falha ao excluir sala na Daily: ${response.status} ${detail}`);
  }
}

export async function createDailyMeetingToken(
  roomName: string,
  isOwner = false,
  userName?: string,
  userId?: string,
) {
  const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: dailyHeaders(),
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: isOwner,
        user_name: userName,
        user_id: userId,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Falha ao gerar token da Daily: ${response.status} ${detail}`);
  }

  return response.json() as Promise<{ token: string }>;
}
