import { close_reasons, stream_types } from '../packet.mjs';
import { options } from './options.mjs';
import * as net from './net.mjs';

import ipaddr from 'ipaddr.js';

export class AccessDeniedError extends Error {}

function check_port_range(entry, port) {
  return entry === port || (entry[0] <= port && entry[1] >= port);
}
function check_whitelist(entries, filter) {
  let matched = false;
  for (let entry of entries) {
    if (filter(entry)) {
      matched = true;
      break;
    }
  }
  return !matched;
}
function check_blacklist(entries, filter) {
  for (let entry of entries) {
    if (filter(entry)) return true;
  }
  return false;
}

function check_ip_range(ip, range) {
  return range.includes(ip.range());
}

export function is_ip_blocked(ip_str) {
  if (!ipaddr.isValid(ip_str)) return false;
  let ip = ipaddr.process(ip_str);

  let loopback_ranges = ['loopback', 'unspecified'];
  let private_ranges = ['broadcast', 'linkLocal', 'carrierGradeNat', 'private', 'reserved', 'uniqueLocal', 'multicast'];

  if (!options.allow_loopback_ips && check_ip_range(ip, loopback_ranges)) return true;
  if (!options.allow_private_ips && check_ip_range(ip, private_ranges)) return true;
  return false;
}

export async function is_stream_allowed(connection, type, hostname, port, resolved = {}) {
  if (
    ![stream_types.TCP, stream_types.UDP].includes(type) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !hostname ||
    hostname.length > 253 ||
    /[\s\x00-\x1f]/.test(hostname)
  )
    return close_reasons.InvalidInfo;

  if (!options.allow_tcp_streams && type === stream_types.TCP) return close_reasons.HostBlocked;
  if (!options.allow_udp_streams && type === stream_types.UDP) return close_reasons.HostBlocked;

  if (options.hostname_whitelist) {
    if (check_whitelist(options.hostname_whitelist, entry => entry.test(hostname))) return close_reasons.HostBlocked;
  } else if (options.hostname_blacklist) {
    if (check_blacklist(options.hostname_blacklist, entry => entry.test(hostname))) return close_reasons.HostBlocked;
  }

  if (options.port_whitelist) {
    if (check_whitelist(options.port_whitelist, entry => check_port_range(entry, port)))
      return close_reasons.HostBlocked;
  } else if (options.port_blacklist) {
    if (check_blacklist(options.port_blacklist, entry => check_port_range(entry, port)))
      return close_reasons.HostBlocked;
  }

  let ip_str = hostname;
  if (ipaddr.isValid(hostname)) {
    if (!options.allow_direct_ip) return close_reasons.HostBlocked;
  } else {
    try {
      ip_str = await net.lookup_ip(hostname);
    } catch {
      return close_reasons.UnreachableHost;
    }
  }
  if (is_ip_blocked(ip_str)) return close_reasons.HostBlocked;
  resolved.address = ip_str;

  if (!connection) return 0;

  if (options.stream_limit_total !== -1 && Object.keys(connection.streams).length >= options.stream_limit_total)
    return close_reasons.ConnThrottled;
  if (options.stream_limit_per_host !== -1) {
    let streams_per_host = 0;
    for (let stream of Object.values(connection.streams)) {
      if (stream.socket.hostname === hostname) {
        streams_per_host++;
      }
    }
    if (streams_per_host >= options.stream_limit_per_host) return close_reasons.ConnThrottled;
  }

  return 0;
}
