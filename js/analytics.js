import { POSTHOG } from './config.js';

// Official PostHog JS snippet (stub queue + async array.js load).
// Methods queue before the script arrives, so track() is always safe.
let active = false;

export function initAnalytics() {
  if (!POSTHOG?.key) return;
  /* eslint-disable */
  !function (t, e) {
    var o, n, p, r;
    e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) {
      function g(t, e) {
        var o = e.split('.');
        2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
      }
      (p = t.createElement('script')).type = 'text/javascript', p.async = !0,
      p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js',
      (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
      var u = e;
      for (void 0 !== a ? u = e[a] = [] : a = 'posthog', u.people = u.people || [],
      u.toString = function (t) { var e = 'posthog'; return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e; },
      u.people.toString = function () { return u.toString(1) + '.people (stub)'; },
      o = 'init capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset'.split(' '),
      n = 0; n < o.length; n++) g(u, o[n]);
      e._i.push([i, s, a]);
    }, e.__SV = 1);
  }(document, window.posthog || []);
  /* eslint-enable */
  window.posthog.init(POSTHOG.key, {
    api_host: POSTHOG.host,
    person_profiles: 'identified_only',
    autocapture: false,
  });
  active = true;
}

export function track(event, props = {}) {
  if (active) window.posthog.capture(event, props);
}

export function identify(pid, name) {
  if (active) window.posthog.identify(pid, name ? { name } : undefined);
}
