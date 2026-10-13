import _ from 'lodash';

export function convertErrorToObject(error: any) {
  if (!error) return null;
  return _.pick(error, Object.getOwnPropertyNames(error));
}
