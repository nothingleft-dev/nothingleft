import { initCalculator } from './calculator';
import { initComparisonMatrix } from './compare-matrix';
import { initDemo } from './demo';
import { initFaq } from './faq';
import { initMenu } from './menu';
import { initCopyButtons, initTabs } from './tabs';
import { initWalkthrough } from './walkthrough';
import { initWorkflow } from './workflow';

// One component that fails to start must not stop the others.
for (const init of [
  initMenu,
  initCalculator,
  initComparisonMatrix,
  initDemo,
  initFaq,
  initWorkflow,
  initWalkthrough,
  initTabs,
  initCopyButtons,
]) {
  try {
    init();
  } catch (error) {
    console.error(error);
  }
}
