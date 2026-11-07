import type { ComponentType } from 'react';
import type { PluginAppBuilder } from '@get-bb/plugin-sdk/app';

export type ThreadHeaderActionProps = {
  threadId: string;
  projectId: string;
  isCompactViewport: boolean;
};

type ThreadHeaderActionRegistration = {
  id: string;
  title: string;
  component: ComponentType<ThreadHeaderActionProps>;
};

// BB still renders experimental_threadHeaderAction for installed plugins, but
// SDK typings dropped it. Its replacement, experimental_threadAction with
// placement "header", renders only a label button, which cannot show live
// progress or open the progress dialog these headers need.
export function registerThreadHeaderAction(app: PluginAppBuilder, registration: ThreadHeaderActionRegistration) {
  const slots = app.slots as PluginAppBuilder['slots'] & {
    experimental_threadHeaderAction(registration: ThreadHeaderActionRegistration): void;
  };
  slots.experimental_threadHeaderAction(registration);
}
