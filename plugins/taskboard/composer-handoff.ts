import type { PluginComposerMention } from '@get-bb/plugin-sdk/app';
import type { WorkItem } from './contract.js';

export const TASKBOARD_COMPOSER_MIME =
  'application/x-bb-taskboard-mention+json';

const TASKBOARD_MENTION_PROVIDER = 'external-work-item';
const MAX_DRAG_PAYLOAD_LENGTH = 2_048;
const MAX_MENTION_ID_LENGTH = 1_024;
const MAX_MENTION_LABEL_LENGTH = 160;
const UNSAFE_DISPLAY_CONTROL =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

type TaskboardMentionSource = Pick<
  WorkItem,
  'bbProjectId' | 'source' | 'locator' | 'key'
>;

function validBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim().length > 0 &&
    !UNSAFE_DISPLAY_CONTROL.test(value)
  );
}

function validMentionId(value: unknown): value is string {
  if (!validBoundedText(value, MAX_MENTION_ID_LENGTH)) return false;
  const firstSeparator = value.indexOf(':');
  const secondSeparator = value.indexOf(':', firstSeparator + 1);
  if (
    firstSeparator <= 0 ||
    secondSeparator <= firstSeparator + 1 ||
    secondSeparator >= value.length - 1
  ) {
    return false;
  }
  const source = value.slice(firstSeparator + 1, secondSeparator);
  return source === 'github' || source === 'linear' || source === 'jira';
}

export function taskboardComposerMention(
  item: TaskboardMentionSource
): PluginComposerMention {
  return {
    provider: TASKBOARD_MENTION_PROVIDER,
    id: `${item.bbProjectId}:${item.source}:${item.locator}`,
    label: item.key
  };
}

export function serializeTaskboardComposerMention(
  mention: PluginComposerMention
): string | null {
  if (
    mention.provider !== TASKBOARD_MENTION_PROVIDER ||
    !validMentionId(mention.id) ||
    !validBoundedText(mention.label, MAX_MENTION_LABEL_LENGTH)
  ) {
    return null;
  }
  return JSON.stringify({
    provider: mention.provider,
    id: mention.id,
    label: mention.label
  });
}

export function parseTaskboardComposerMention(
  value: string
): PluginComposerMention | null {
  if (value.length === 0 || value.length > MAX_DRAG_PAYLOAD_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'id,label,provider' ||
    record.provider !== TASKBOARD_MENTION_PROVIDER ||
    !validMentionId(record.id) ||
    !validBoundedText(record.label, MAX_MENTION_LABEL_LENGTH)
  ) {
    return null;
  }
  return {
    provider: TASKBOARD_MENTION_PROVIDER,
    id: record.id,
    label: record.label
  };
}

export function hasTaskboardComposerDragType(
  types: readonly string[] | DOMStringList
): boolean {
  return Array.from(types).includes(TASKBOARD_COMPOSER_MIME);
}

export function writeTaskboardComposerDrag(
  dataTransfer: Pick<DataTransfer, 'effectAllowed' | 'setData'>,
  item: TaskboardMentionSource,
  effectAllowed: 'copy' | 'copyMove'
): boolean {
  const payload = serializeTaskboardComposerMention(
    taskboardComposerMention(item)
  );
  if (payload === null) return false;
  try {
    dataTransfer.setData(TASKBOARD_COMPOSER_MIME, payload);
    dataTransfer.effectAllowed = effectAllowed;
    return true;
  } catch {
    return false;
  }
}
