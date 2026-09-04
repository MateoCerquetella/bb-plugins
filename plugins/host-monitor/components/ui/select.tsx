import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

declare const __BB_PLUGIN_ID__: string | undefined;

function portalScopeProps() {
  const pluginId = typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : undefined;
  return {
    "data-bb-portaled-overlay": "" as const,
    "data-bb-plugin-root": "" as const,
    ...(pluginId === undefined ? {} : { "data-bb-plugin": pluginId }),
  };
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
  ComponentRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ children, className = "", ...props }, ref) {
  return (
    <SelectPrimitive.Trigger className={`bb-select__trigger ${className}`.trim()} ref={ref} {...props}>
      {children}
      <SelectPrimitive.Icon asChild><ChevronDownIcon /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
export const SelectContent = forwardRef<
  ComponentRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ children, className = "", position = "popper", ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        {...portalScopeProps()}
        className={`bb-select__content ${className}`.trim()}
        position={position}
        ref={ref}
        sideOffset={4}
        {...props}
      >
        <SelectPrimitive.Viewport className="bb-select__viewport">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = forwardRef<
  ComponentRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ children, className = "", ...props }, ref) {
  return (
    <SelectPrimitive.Item className={`bb-select__item ${className}`.trim()} ref={ref} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="bb-select__indicator">
        <SelectPrimitive.ItemIndicator><CheckIcon /></SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
});
