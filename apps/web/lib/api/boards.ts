import type { Board, BoardView, CreateBoard, UpdateBoard } from '@nothingleft/types';
import { api } from '@lib/api/client';

const project = (key: string) => `/v1/projects/${encodeURIComponent(key)}`;
const board = (key: string, name: string) => `${project(key)}/boards/${encodeURIComponent(name)}`;

export const getBoardBySlug = (slug: string) => api.get<Board>(`/v1/boards/${encodeURIComponent(slug)}`);

export const listBoards = (key: string) => api.get<Board[]>(`${project(key)}/boards`);

export const getBoard = (key: string, name: string) => api.get<Board>(board(key, name));

export const createBoard = (key: string, body: CreateBoard) => api.post<Board>(`${project(key)}/boards`, { body });

export const updateBoard = (key: string, name: string, body: UpdateBoard) =>
  api.patch<Board>(board(key, name), { body });

export const deleteBoard = (key: string, name: string) => api.delete<Board>(board(key, name));

export interface BoardViewQuery {
  /** `current`, or a sprint's slug. */
  sprint: string;
  q?: string;
}

export const getBoardView = (key: string, name: string, query: BoardViewQuery) =>
  api.get<BoardView>(`${board(key, name)}/view`, { query: { sprint: query.sprint, q: query.q || undefined } });
