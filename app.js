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

const app = express();

app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(methodOverride('_method'));
app.set('view engine', 'ejs');

// SET UP DATABASE

mongoose.connect('mongodb://localhost:27017/todolistDB', {useNewUrlParser: true});

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

app.use(passport.initialize());

// SET UP SESSION

app.use(session({
  secret: 'Flying purple people eater',
  resave: false,
  saveUninitialized: false,
}))

app.use(passport.session());



let listTitle = '';
let showCompleted = false;
const today = date.getDate();
let day;

function createNewList(listTitle) {
	List.findOne({title: listTitle}, function(err, foundList) {
		if (err) {
			console.log(err);
		} else {
			if (foundList) {
				console.log('List with this title already exists!');
			} else {
				List.create({ title: listTitle }, function (err, createdList) {
				  if (err) {
						console.log(err);
				  } else {
				  	console.log('Successfully saved list ' + listTitle + ' to collection Lists.');
					}
				});
			}
		}		
	})
};

function createNewTask(name) {
	const newTask = new Task ({ taskName: name })
	newTask.save(function (err) {
		if (err) {
			console.log(err);
	  } else {
	  	console.log('Successfully saved task ' + name + ' to collection Tasks.');
		}
	});
	return newTask;
};

function pushToList(task, listTitle) {
	List.findOneAndUpdate({ title: listTitle }, { $push: { tasks: task } }, function(err, updatedList) {
		if (err) {
			console.log(err);
	  } else {
	  	console.log('successfully saved task: ' + task + ' to list: ' + listTitle);
		}
	});
}

function toggleCompleted(taskId){
	Task.findOne({_id: taskId}, function(err, foundTask) {
		if (err) {
			console.log(err);
	  } else {
	  	foundTask.completed = !foundTask.completed;
			foundTask.save();
	  	console.log('successfully toggled completed status to: ' + foundTask.completed);
		}
	});
}

function deleteTaskAndRemoveFromList(taskId, listTitle){
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
}

function deleteListAndListTasks(listTitle) {
	List.findOne({title: listTitle}, function(err, foundList) {
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

	List.findOneAndRemove({title: listTitle}, function(err) {
		if (err) {
			console.log(err);
	  } else {
	  	console.log('Successfully deleted list');
		}
	});
}

// ROUTES

app.get('/', function(req, res) {
	res.redirect('/login');
});

app.route('/lists')
	.get(function(req, res) {
		if (req.isAuthenticated){
			List.find(function(err, foundLists) {
				if (err) {
					console.log(err);
				} else {
					res.render('lists', {lists: foundLists, today: today});
				}
			})
		} else {
			console.log("no logged in user");
			res.redirect('/login');
		}
		
	})
	.post(function(req, res) {
		const newList = _.lowerCase(req.body.newList.toLowerCase());
		console.log(newList);
		createNewList(newList);

		res.redirect('/lists');	
	});

app.route('/lists/:listTitle')
	.get(function (req, res) {
		listTitle = _.lowerCase(req.params.listTitle);
		List.findOne({title: listTitle}).populate('tasks').exec(function(err, foundList) {
			if (err) {
				console.log(err);
			} else {
				if (foundList) {
					res.render('list', {today: today, list: foundList, showCompleted: showCompleted});
				} else {
					res.redirect('/lists');
				}
			}
		});
	})
	.delete(function(req, res) {
		let listTitle = req.body.listTitle;
		deleteListAndListTasks(listTitle);

		res.redirect('/lists/'+listTitle);
	})
	
app.route('/lists/:listTitle/tasks')
	.post(function(req, res) {
		const taskName = req.body.newItem;
		const newTask = createNewTask(taskName);
		pushToList(newTask, listTitle);

		res.redirect('/lists/'+listTitle);
	});

app.route('/lists/:listTitle/tasks/:taskId')
	.delete(function(req, res) {
		let taskId = req.body.deletedTaskId;
		deleteTaskAndRemoveFromList(taskId, listTitle);

		res.redirect('/lists/'+listTitle);
	});

app.get('/login', function(req, res) {
		res.render('login');
	})

app.get('/auth/google',
	passport.authenticate('google', { scope: ['profile'] }));

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

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/login');
});



app.post('/toggleCompleted', function(req, res) {
	let taskId = req.body.completedTaskId;
	toggleCompleted(taskId);

	res.redirect('/lists/'+listTitle);
})

app.post('/toggleShowCompleted', function(req, res) {
	showCompleted = JSON.parse(req.body.desiredStatus);

	res.redirect('/lists/'+listTitle);
})

// START SERVER 

app.listen(3000, function() {
	console.log('Server running on port 3000');
});

