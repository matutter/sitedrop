/**
* This is the users controller. A Controller module is a single "module" export which exports a single object which
* may be instantiated with *new* and inheriting the Controller base class.
* Controller define the routes which handle the interaction between requests & api.
*/
const inherits = require('../core/Controller.js').inherits;
const debug = require('debug')('app.users.controller');
const validator = require('validator');
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

debug('loaded');

const AccountEmailUpdateError = ApiError(
  'Invalid address', 
  'The email you\'ve entered is empty or invalid.', {
  status: 406, // not acceptable
});

const AccountNameUpdateError = ApiError(
  'Invalid username', 
  'The username you\'ve entered is empty or invalid.', {
  status: 406, // not acceptable
});

module.exports = UserController;

function UserController(app) {
  UserController.super_.call(this, app);

	const upload = multer({ dest: app.userdir });
	const uploadSettings = upload.fields([
		{ name: 'image', maxCount: 1 },
		{ name: 'delete_image', maxCount: 1 },
		{ name: 'name', maxCount: 1 },
		{ name: 'email', maxCount: 1 }
	]);

	this
		.get('/users/login', (req, res) => res.render('users/login.pug'))
		.get('/users/logout', (req, res) => res.render('users/logout.pug'))
    .get('/users/register', (req, res) => res.render('users/register.pug'))
    .get('/users/settings', (req, res) => res.redirect('/users/settings/general'))
    .get('/users/settings/general', (req, res) => res.render('users/settings/general.pug'))
    .get('/users/settings/activity', (req, res) => res.render('users/settings/activity.pug'))
    .get('/users/settings/security', (req, res) => res.render('users/settings/security.pug'))
		.post('/users/login', this.post_login)
		.post('/users/login/json', this.post_login_json)
		.post('/users/register', this.register)
		.post('/users/register/json', this.register)
		.post('/users/logout/json', this.post_logout_json)
		.post('/users/settings/general', uploadSettings, this.post_settings_general)
		.use('/users/data/image', express.static(app.userdir));
}
inherits(UserController);

UserController.prototype.post_settings_general = function(req, res, next) {
	var user = res.locals.user;
	var form = req.body;
	
	debug('updating general settings for', user.name);
	
	if(form.delete_image) {
		user.image_name = null;
	}
	if(form.name) {
		user.name = form.name;
	}
	if(form.email) {
		user.email = form.email;
	}
	if(req.files.image && req.files.image[0]) {
		var image = req.files.image[0];
		user.image_name = image.filename;
	}
	
	user.save().then(() => {
		res.redirect('/users/settings/general');
	}).catch(next);
}

UserController.prototype.updateProfile = function(req, res, next) {
	debug('attempting to update profile', req.body)
	
	const data = req.body || {};
	const email = data.email;
	const name = data.name;

	var changed = false;

	if(email && email.length) {
		if(!validator.isEmail(email)) {
			return next(AccountEmailUpdateError)
		} else {
			res.locals.user.email = email;
			changed = true;
		}
	}

	// TODO: this should be enforced in the schema
	if(name && name.length) {
		if(name.length < 3 || !name.match(/[a-zA-Z][a-zA-Z0-9-_. ]{2,}/)) {
			return next(AccountNameUpdateError)
		} else {
			res.locals.user.name = name
			changed = true;
		}
	}

	if(changed) {
		res.locals.user.save().then(() => {
			res.redirect('/users/settings')
		}).catch(next)
	} else {
		res.redirect('/users/settings')
	}
}

UserController.prototype.post_login = function(req, res, next) {
	this.login(req).then(user => {
		res.redirect('/');
	}).catch(next)
}

UserController.prototype.post_login_json = function(req, res, next) {
	this.login(req).then(user => {
		res.json({ action: '/users/login', result: 1 })
	}).catch(next)
}

UserController.prototype.login = function(req) {
  debug('attempting login', req.body)

	return this.api.users.login(req.body).then(user => {
	 	// sets cookie
		req.session.user = user.public()
		return user;
	}).tap(user => this.api.events.users.create(user, `"${user.name}" logged in`, ['login']))
};

UserController.prototype.register = function(req, res, next) {
	debug('attempting register for "%s"', req.body.email)

	if(res.locals.session) {
		return res.json({ action: '/users/register', result: 0 })
	}

	this.api.users.register(req.body).then(user => {

		// sets cookie
		req.session.user = user.public()

		if(req.json) {
			res.json({ action: '/users/register', result:1 })
		} else {
			res.redirect('/')
		}
	}).catch(next)
}

UserController.prototype.post_logout_json = function(req, res, next) {
	debug('attempting logout', req.body)

	this.api.users.logout(req.body, res.locals.user).then(may_logout => {
		
		if(may_logout)
			delete req.session.user

		res.json({ action: '/api/users/logout', result: (may_logout ? 1: 0) })
	}).catch(next)
}