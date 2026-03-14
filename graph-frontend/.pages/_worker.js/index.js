
import handler from './index.mjs';

export default {
  async fetch(request, env, ctx) {
    return handler.fetch(request, env, ctx);
  },
};
