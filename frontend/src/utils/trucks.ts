import type { TruckType } from '../types/routing';

export const TRUCK_OPTIONS: { value: TruckType; label: string; note: string }[] = [
  {
    value: 'dry_van',
    label: "53' Dry Van",
    note: 'High side-wall surface area increases crosswind sensitivity.',
  },
  {
    value: 'reefer',
    label: "53' Refrigerated Trailer",
    note: 'Heavy insulated box with high crosswind profile but lower center of gravity.',
  },
  {
    value: 'flatbed',
    label: "48' Flatbed",
    note: 'Lower side wind drag; exposed cargo requires tarping in heavy rain or snow.',
  },
  {
    value: 'tanker',
    label: 'Liquid Bulk Tanker',
    note: 'Cylindrical profile reduces wind drag, but liquid surge increases braking risk on slick roads.',
  },
  {
    value: 'doubles',
    label: "Twin 28' Doubles",
    note: 'Articulated rear pup trailer is highly vulnerable to wind gusts and icy lane changes.',
  },
];

export function truckLabel(value: TruckType): string {
  return TRUCK_OPTIONS.find((item) => item.value === value)?.label ?? value;
}
