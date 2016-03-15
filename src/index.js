'use strict';

import bscoords from 'bscoords';
import meitrack from 'meitrack-parser';
import moment from 'moment';
import Promise from 'bluebird';
import rg from 'simple-reverse-geocoder';
import tz from 'tz-parser';

Promise.promisifyAll(bscoords);

const setCache = (instance) => {
  rg.setCache(instance);
};

const getImei = (raw) => {
  const data = raw.toString();
  let imei;
  if (tz.patterns.avl05.test(data)) {
    imei = tz.patterns.avl05.exec(data)[2];
  } else if (tz.patterns.avl08.test(data)) {
    imei = tz.patterns.avl08.exec(data)[2];
  } else if (tz.patterns.avl201.test(data)) {
    imei = tz.patterns.avl201.exec(data)[2];
  } else if (meitrack.patterns.mvt380.test(data)) {
    imei = meitrack.patterns.mvt380.exec(data)[3];
  }
  return imei;
};

const getLoc = (mcc, mnc, lac, cid) => {
  return new Promise((resolve, reject) => {
    bscoords.requestGoogleAsync(mcc, mnc, lac, cid).then(coords => {
      resolve({
        type: 'Point',
        coordinates: [coords.lon, coords.lat]
      });
    }).catch(reject);
  });
};

const addLoc = (data, options = {}) => {
  return new Promise((resolve) => {
    data.gps = data.loc ? 'enable' : 'disable';
    if (data.gps === 'enable') return resolve(data);
    const mcc = options.mcc || 730;
    const mnc = options.mnc || 1;
    getLoc(mcc, mnc, data.lac, data.cid).then(loc => {
      if (!loc) return resolve(data);
      data.loc = loc;
      data.gps = 'triangulation';
      resolve(data);
    }).catch(() => resolve(data));
  });
};

const addAddress = (data) => {
  return new Promise((resolve, reject) => {
    if (!data.loc) return resolve(data);
    rg.getAddress(data.loc).then(address => {
      data.address = address;
      resolve(data);
    }).catch(reject);
  });
};

const checkCurrentInfoPanel = (datetime) => {
  moment.locale('es');
  const now = moment.utc();
  now.subtract(1, 'minutes');
  return {
    isCurrent: now < moment.utc(datetime),
    diff: moment.duration(now.diff(datetime)).humanize()
  };
};

const parse = (raw, options = {}) => {
  return new Promise((resolve, reject) => {
    let data = {raw: raw.toString()};
    if (tz.isTz(raw)) {
      data = tz.parse(raw);
    } else if (meitrack.isMeitrack(raw)) {
      data = meitrack.parse(raw);
    }
    if (data.type !== 'data') return resolve(data);
    data.currentData = checkCurrentInfoPanel(data.datetime);
    data.gps = data.loc ? 'enable' : 'disable';
    addLoc(data, options).then(addAddress).then(resolve).catch(reject);
  });
};

const parseCommand = (data) => {
  let command = null;
  if (data.device === 'tz') {
    command = tz.parseCommand(data);
  }
  return command;
};

module.exports = {
  getImei: getImei,
  setCache: setCache,
  parse: parse,
  parseCommand: parseCommand
};
