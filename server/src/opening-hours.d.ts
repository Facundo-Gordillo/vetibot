declare module "opening_hours" {
  class OpeningHours {
    constructor(value: string, nominatim?: unknown, latlng?: unknown);
    /** Devuelve true/false según esté abierto, o null si no se puede determinar. */
    getState(date?: Date): boolean | null;
    /** Próximo cambio de estado (Date) o undefined. */
    getNextChange(date?: Date): Date | undefined;
    getOpenIntervals(): unknown;
    getComment(): string;
  }
  export = OpeningHours;
}
