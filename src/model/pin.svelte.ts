/** Метка на карте: точка, найденная по координатам или поставленная вручную. */

import type { LngLat } from '../core/geodesy';

export const pin = $state<{ position: LngLat | null }>({ position: null });
