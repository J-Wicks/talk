/**
 * authorization contains the references to the authorization middleware.
 * @type {Object}
 */
const authorization = module.exports = {};

const debug = require('debug')('talk:middleware:authorization');

/**
 * ErrNotAuthorized is an error that is returned in the event an operation is
 * deemed not authorized.
 * @type {Error}
 */
const ErrNotAuthorized = new Error('not authorized');
ErrNotAuthorized.status = 401;

// Add the ErrNotAuthorized error to the authorization object to be exported.
authorization.ErrNotAuthorized = ErrNotAuthorized;

/**
 * has returns true if the user has all the roles specified, otherwise it will
 * return false.
 * @param  {Object} user  the user to check for roles
 * @param  {Array}  roles all the roles that a user must have
 * @return {Boolean}      true if the user has all the roles required, false
 *                        otherwise
 */
authorization.has = (user, ...roles) => roles.every((role) => user.roles.indexOf(role) >= 0);

/**
 * needed is a connect middleware layer that ensures that all requests coming
 * here are both authenticated and match a set of roles required to continue.
 * @param  {Array} roles all the roles that a user must have
 * @return {Callback}    connect middleware
 */
authorization.needed = (...roles) => (req, res, next) => {
  // All routes that are wrapepd with this middleware actually require a role.
  if (!req.user) {
    debug(`No user on request, returning with ${ErrNotAuthorized}`);
    return next(ErrNotAuthorized);
  }

  // Check to see if the current user has all the roles requested for the given
  // array of roles requested, if one is not on the user, then this will
  // evaluate to true.
  if (!authorization.has(req.user, ...roles)) {
    debug('User does not have all the required roles to access this page');
    return next(ErrNotAuthorized);
  }

  // Looks like they're allowed!
  return next();
};