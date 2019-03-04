require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const date = require(__dirname + '/date.js');
const mongoose = require('mongoose');
const _ = require('lodash');
const methodOverride = require('method-override');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const moment = require('moment');

const app = express();

app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(methodOverride('_method'));
app.set('view engine', 'ejs');

// SET UP SESSION

app.use(session({
  secret: 'Flying purple people eater',
  resave: false,
  saveUninitialized: false,
}))

app.use(passport.initialize());
app.use(passport.session());


// SET UP DATABASE

mongoose.connect(process.env.DATABASE_URL, {useNewUrlParser: true});

const taskSchema = new mongoose.Schema({
  taskName: {
		type: String,
		required: true
	},
	completed: {
		type: Boolean,
		default: false
	},
	dueDate: {
		type: Date,
	}
});
const Task = mongoose.model('Task', taskSchema);

const listSchema = new mongoose.Schema({
	title: {
		type: String,
		required: true
	},
	tasks: [{
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Task'
	}]
});
const List = mongoose.model('List', listSchema);

const userSchema = new mongoose.Schema({
  googleId: String,
  facebookId: String,
  email: String,
  password: String,
	lists: [{
		type: mongoose.Schema.Types.ObjectId,
		ref: 'List'
	}]
});
const User = mongoose.model('User', userSchema);

// SET UP PASSPORT

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback',
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
  }, 
  function(accessToken, refreshToken, profile, cb) {
    User.findOne({ googleId: profile.id }, function (err, user) {
    	if (user) {
      	console.log("successfully found user" + user);
   			return cb(err, user);
      } else {
      	User.create({ googleId: profile.id }, function(err, user) {
      		if (user) {
		      	console.log("successfully created user" + user);
		      	return cb(err, user);
      		}
      	});
      }
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: 'http://localhost:3000/auth/facebook/callback',
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOne({ facebookId: profile.id }, function (err, user) {
    	if (user) {
      	console.log("successfully found user" + user);
   			return cb(err, user);
      } else {
      	User.create({ facebookId: profile.id }, function(err, user) {
      		if (user) {
		      	console.log("successfully created user" + user);
		      	return cb(err, user);
      		}
      	});
      }
    });
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

let showCompleted = false;
let day;

function createUser(email, password, req, response) {
	User.findOne({email: email}, function(err, user) {
		if (user) {
			console.log("user already exists");
			response.redirect('/login');
		} else {
			bcrypt.hash(password, saltRounds, function(err, hash) {
			  if (err) {
					console.log(err);
					response.redirect('/register');
				} else {
					// return bindings.encrypt(data, salt, cb);
					User.create({email: email, password: hash}, function(err, user) {
						if (err) {
							console.log(err);
							response.redirect('/register');
						} else {
							console.log('created user: ' + user);
							req.login(user, function(err) {
						  	if (err) { 
						  		return next(err); 
						  		response.redirect('/login');
						  	}
							  return response.redirect('/lists');
							});
						}
					})
				}
			});
		}
	});
};

function findAndAuthenticateUser(email, password, req, response) {
	User.findOne({email: email}, function(err, user) {
		if (err) {
			console.log(err);
			response.redirect('/login');
		} else {
			if (user) {
				bcrypt.compare(password, user.password, function(err, res) {
					if (res) {
						req.login(user, function(err) {
						  if (err) { return next(err); }
							  return response.redirect('/lists');
							});
					} else {
						response.redirect('/login');
					}
				});
			} else {
				console.log("no such user");
				response.redirect('/register');
			}
		}
	})
};

function requireAuthentication(req, res, next) {
	if (req.isAuthenticated()) {
		next();
	} else {
		console.log('not authenticated');
		res.redirect('/login');
	}
};

function findUsersListByTitle(listTitle, userId, next) {
	User.findOne({_id: userId}).populate('lists').exec(function(err, foundUser) {
		if (err) { 
			console.log(err)
		} else {
			list = foundUser.lists.find(function(list) {
				return list.title === listTitle;
			});
			next();
		}
	})
};

function createNewListForUser(listTitle, userId) {
	List.create({ title: listTitle }, function (err, createdList) {
	  if (err) {
			console.log(err);
	  } else {
	  	console.log('Successfully saved list ' + listTitle + ' to collection Lists.');
	  	User.findOneAndUpdate({ _id: userId }, { $push: { lists: createdList } }, function(err, updatedUser) {
				if (err) {
					console.log(err);
			  } else {
			  	console.log('Successfully saved list: ' + createdList.title + ' to user: ' + userId);
				}
			});
		}
	});
};

function deleteListAndListTasks(listId) {
	List.findOne({_id: listId}, function(err, foundList) {
		if (err) {
			console.log(err);
		} else {
			Task.deleteMany({_id: { $in: foundList.tasks}}, function(err) {
				if (err) {
					console.log(err);
				} else {
					console.log("Successfully deleted this list's tasks");					
				}
			});
		}
	})

	List.findOneAndRemove({_id: listId}, function(err) {
		if (err) {
			console.log(err);
	  } else {
	  	console.log('Successfully deleted list');
		}
	});
};

function createNewTaskForUsersList(taskName, dueDate, list) {
	Task.create({taskName: taskName, dueDate: new Date(dueDate) }, function (err, task) {
	  if (err) {
			console.log(err);
	  } else {
	  	console.log('Successfully saved task ' + taskName + ' to collection Tasks, and to list: ' + list.title);
	  	list.tasks.push(task);
	  	list.save();
		}
	});
};

function deleteTaskAndRemoveFromList(taskId, listTitle) {
	Task.findOneAndRemove({_id: taskId}, function(err) {
		if (err) {
			console.log(err);
		} else {
			console.log('Successfully deleted task');
		}
	});

	List.findOneAndUpdate({title: listTitle}, { $pull: {tasks: taskId} }, function(err, foundList) {
		if (err) {
			console.log(err);
	  } else {
			console.log('Successfully removed task from list ' + listTitle);
		}
	});
};

function toggleCompleted(taskId) {
	Task.findOne({_id: taskId}, function(err, foundTask) {
		if (err) {
			console.log(err);
	  } else {
	  	foundTask.completed = !foundTask.completed;
			foundTask.save();
	  	console.log('successfully toggled completed status to: ' + foundTask.completed);
		}
	});
};

function displayDueBy(req, res, userId, dueDate) {
	User.findOne({_id: userId}).populate('lists').exec(function(err, foundUser) {
		if (err) { 
			console.log(err)
		} else {
			foundUser.lists.forEach(function(list) {
				list.populate('tasks', function(err, populatedList) {
					if (err) { 
						console.log(err);
						res.redirect('/lists/');
					} else {
						var dueTasks = [];
						populatedList.tasks.forEach(function(task) {
							if (moment().isSame(task.dueDate, 'day')) {
								dueTasks.push(task);
							}
						})
						res.render('smartlist', {today: moment(), dueTasks: dueTasks, dueDate: dueDate, showCompleted: showCompleted, completed: false});
					}
				})
			})
		}
	});
}

// DEFINE ROUTES

app.get('/', function(req, res) {
	res.redirect('/login');
});

app.route('/lists')
	.get(function(req, res) {
		requireAuthentication(req, res, function() {
			User.findOne({_id: req.user._id}).populate('lists').exec(function(err, user) {
				if (err) {
					console.log(err);
				} else {
					if (user) {
						res.render('lists', {lists: user.lists, today: moment()});
					} else {
						console.log('user not found');
						res.redirect('/login');
					}
				}
			});
		});
	})
	.post(function(req, res) {
		const newListTitle = _.lowerCase(req.body.newList.toLowerCase());
		requireAuthentication(req, res, function() {
			findUsersListByTitle(newListTitle, req.user._id, function() {
				if (list) {
					console.log('User already has a list with this title');
				} else {
					createNewListForUser(newListTitle, req.user._id);
				}	
			})
			res.redirect('/lists/' + newListTitle);	
		});
	});

app.route('/lists/:listTitle')
	.get(function (req, res) {
		const listTitle = _.lowerCase(req.params.listTitle);
		if (req.query.showCompleted) {
				showCompleted = JSON.parse(req.query.showCompleted);
			}

		if (listTitle == 'today') {
			requireAuthentication(req, res, function() {
				displayDueBy(req, res, req.user._id, listTitle);
			});
		} else{
			requireAuthentication(req, res, function() {
				findUsersListByTitle(listTitle, req.user._id, function() {
					if (list) {
						list.populate('tasks', function(err, populatedList) {
							if (err) { 
								console.log(err);
								res.redirect('/lists/' + listTitle);
							} else {
								res.render('list', {today: moment(), tomorrow: moment().add(1, 'days'), list: populatedList, showCompleted: showCompleted});
							}
						})
					} else {
						res.redirect('/lists');
					}
				});
			});
		}
	})
	.delete(function(req, res) {
		const listTitle = req.body.listTitle; // home
		requireAuthentication(req, res, function() {
			findUsersListByTitle(listTitle, req.user._id, function() {
				if (list) {
					deleteListAndListTasks(list._id);
					User.findOneAndUpdate({_id: req.user._id}, { $pull: {lists: list._id} }, function(err, foundUser) {
						if (err) {
							console.log(err);
					  } else {
							console.log('Successfully removed list from user');
						}
					});
				} else {
					console.log('This user does not have a list with this title')
				}
				res.redirect('/lists');
			});
		});
	})
	
app.route('/lists/:listTitle/tasks')
	.post(function(req, res) {
		const listTitle = req.body.listTitle;
		const taskName = req.body.newItem;
		const dueDate = req.body.dueDate;
		requireAuthentication(req, res, function() {
			findUsersListByTitle(listTitle, req.user._id, function() {
				if (list) {
					createNewTaskForUsersList(taskName, dueDate, list);
				} else {
					console.log('This user does not have a list with this title')
				}	
				res.redirect('/lists/' + listTitle);
			});
		});
	});

app.route('/lists/:listTitle/tasks/:taskId')
	.patch(function(req, res) {
		const taskId = req.body.completedTaskId;
		const listTitle = req.body.listTitle;
		toggleCompleted(taskId);
		res.redirect('/lists/' + listTitle);
	})
	.delete(function(req, res) {
		const listTitle = req.body.listTitle;
		const taskId = req.body.deletedTaskId;
		requireAuthentication(req, res, function() {
			findUsersListByTitle(listTitle, req.user._id, function() {
				if (list) {
					deleteTaskAndRemoveFromList(taskId, listTitle);
				} else {
					console.log('This user does not have a list with this title')
				}	
				res.redirect('/lists/' + listTitle);
			});
		});
	});

app.route('/login')
	.get(function(req, res) {
		res.render('login', {route: 'login'});
	})
	.post(function(req, res) {
		findAndAuthenticateUser(req.body.email, req.body.password, req, res);
	});

app.route('/register')
	.get(function(req, res) {
		res.render('login', {route: 'register'});
	})
	.post(function(req, res) {
		createUser(req.body.email, req.body.password, req, res);
	});

app.get('/auth/google',
	passport.authenticate('google', { scope: ['profile'] }), function(req, res) {
	});

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/lists');
  });

app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/lists');
  });

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/login');
});

app.get('/date', function(req, res) {

	var now = moment();
	console.log(now.toISOString());
	console.log(now.toISOString(true));
	console.log(now.format().slice(0, -9));
})

// START SERVER 

let port = process.env.PORT;
if (port == null || port == "") {
	port = 3000
}
app.listen(port, function() {
	console.log('Server running');
});

