/** Состояние инструментов: что выбрано в палитре и что сейчас ставится на карту. */

import type { Affiliation, EchelonId, Unit, UnitTemplate } from '../core/units';

export const palette = $state<{ affiliation: Affiliation; echelon: EchelonId }>({
  affiliation: 'friend',
  echelon: 'platoon',
});

export const tools = $state<{
  /** Фишка, которую поставит следующий щелчок по карте. */
  placing: UnitTemplate | null;
  clipboard: Unit | null;
}>({ placing: null, clipboard: null });
