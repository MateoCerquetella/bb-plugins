import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon, ArrowRight01Icon, Loading03Icon, Clock01Icon,
  HelpCircleIcon, CancelCircleIcon, Tick02Icon, Edit02Icon,
} from "@hugeicons/core-free-icons";

const icons = {
  previous: ArrowLeft01Icon,
  next: ArrowRight01Icon,
  working: Loading03Icon,
  idle: Clock01Icon,
  waiting: HelpCircleIcon,
  error: CancelCircleIcon,
  unread: Tick02Icon,
  draft: Edit02Icon,
  unknown: HelpCircleIcon,
};

export function Icon({ name, className }: { name: keyof typeof icons; className?: string }) {
  return <HugeiconsIcon icon={icons[name]} aria-hidden="true" className={className} />;
}
