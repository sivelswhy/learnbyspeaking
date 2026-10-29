import {
  RiBriefcase4Line, RiChat3Line, RiGraduationCapLine, RiHome4Line, RiHotelLine, RiPlaneLine,
  RiRestaurantLine, RiShoppingBag3Line, RiTaxiLine, RiUserSmileLine,
} from "react-icons/ri";
import type { IconType } from "react-icons";

export const SCENARIO_ICONS: Record<string, IconType> = {
  free: RiChat3Line,
  restaurant: RiRestaurantLine,
  market: RiShoppingBag3Line,
  meet: RiUserSmileLine,
  hotel: RiHotelLine,
  airport: RiPlaneLine,
  taxi: RiTaxiLine,
  daily: RiHome4Line,
  study: RiGraduationCapLine,
  interview: RiBriefcase4Line,
};

export function ScenarioIcon({ id, className }: { id: string; className?: string }) {
  const I = SCENARIO_ICONS[id] ?? RiChat3Line;
  return <I aria-hidden className={className} />;
}
