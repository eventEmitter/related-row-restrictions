
	process.env.debug_sql = true;


	var   log 			= require('ee-log')
		, assert 		= require('assert')
		, fs 			= require('fs')
		, Related 		= require('related');



	var   RowRestirctions = require('../')
		, sqlStatments
		, extension
		, related
		, db;


	// sql for test db
	sqlStatments = fs.readFileSync(__dirname+'/db.postgres.sql').toString().split(';').map(function(input){
		return input.trim().replace(/\n/gi, ' ').replace(/\s{2,}/g, ' ')
	}).filter(function(item){
		return item.length;
	});



	describe('Travis', function(){
		it('should have set up the test db', function(done){
			var config;

			try {
				config = require('../config.js').db
			} catch(e) {
				config = [{
					  type: 'postgres'
					, schema: 'related_restrictions_test'
					, database: 'test'
					, hosts: [{
						  host 		: 'localhost'
						, username 	: 'postgres'
						, password 	: ''
						, port 		: 5432
						, mode 		: 'readwrite'
						, database 	: 'test'
					}]
				}];
			}

			this.timeout(5000);
			related = new Related(config);
			related.load(done);
		});

		it('should be able to drop & create the testing schema ('+sqlStatments.length+' raw SQL queries)', function(done) {
			related.getDatabase('related_restrictions_test').getConnection(function(err, connection) {
				if (err) done(err);
				else {
					Promise.all(sqlStatments.map(function(sql) {
						return new Promise(function(resolve, reject) {
							connection.queryRaw(sql, function(err) {
								if (err) reject(err);
								else resolve();
							});
						});
					})).then(function() {
						done();
					}).catch(done)
				}//async.each(sqlStatments, connection.queryRaw.bind(connection), done);
			});
		});
	});


	var getJSON = function(input) {
		if (Array.isArray(input)) return input.map(getJSON);
		else if (typeof input === 'object') {
			var output = input.toJSON ? input.toJSON() : input;
			if (input.children) output.children = getJSON(input.children);
			return output;
		}
		else return input;
	}


	var expect = function(val, cb){
		if (typeof val === 'string') val = JSON.parse(val);

		return function(err, result) { //log(getJSON(result), val, JSON.stringify(result), JSON.stringify(val));
			try {
				assert.deepEqual(getJSON(result), val);
			} catch (err) {
				return cb(err);
			}
			cb();
		}
	};


	describe('The Row Restrictions Extension', function() {
		var oldDate;

		it('should not crash when instatiated', function() {
			db = related.related_restrictions_test;
			extension = new RowRestirctions();
		});


		it('should not crash when injected into the related', function(done) {
			related.use(extension);
			related.reload(done);
		});

		it('setting variable', function() {
			db = related.related_restrictions_test;
		});
	});



	describe('Inserting Test Data', function() {
		it('Random Data', function(done) {

			this.timeout(10000);

			Promise.all(Array.apply(null, {length:100}).map(function(item, index) {
				return new db.venue({
					  id_tenant 	: index > 80 ? 1 : index > 50 ? 2 : 3
					, name 		 	: 'event_'+index
					, created 		: index > 80 ? new Date(1983, 9 ,2 ,7 ,30, 0) : new Date(2083, 9 ,2 ,7 ,30, 0)
				}).save();
			})).then(function() {
				return Promise.all(Array.apply(null, {length:100}).map(function(item, idx) {
					return new db.event({
						  name 		: 'event_'+idx
						, id_tenant : idx > 80 ? 1 : idx > 50 ? 2 : null
						, id_venue  : Math.ceil(Math.random()*100)
					}).save();
				}));
			}).then(function() {
				done();
			}).catch(done);
		});
	});




	describe('Querying', function() {
		it('Filtering by variable', function(done) {
			db.event('*')
			.setRestrictionVariable('tenantId', 1)
			.restrict({
				id_tenant: [{
					  type: 'variable'
					, operator: 'equal'
					, value: 'tenantId'
				}]
			}).find().then(function(events) {
				assert(events.length > 10);

				if (events.some(function(evt) {
					return evt.id_tenant !== 1;
				})) {
					throw new Error('invalid tenant id!');
				}
				done();
			}).catch(done);
		});

		it('Filtering by variable (nullable)', function(done) {
			db.event('*')
			.setRestrictionVariable('tenantId', 1)
			.restrict({
				id_tenant: [{
					  type: 'variable'
					, operator: 'equal'
					, value: 'tenantId'
					, nullable: true
				}]
			}).find().then(function(events) {
				assert(events.length > 30);

				if (events.some(function(evt) {
					return evt.id_tenant !== 1 && evt.id_tenant !== null;
				})) {
					throw new Error('invalid tenant id!');
				}
				done();
			}).catch(done);
		});

		it('Filtering by fucntion', function(done) {
			db.venue('*')
			.restrict({
				created: [{
					  type: 'function'
					, operator: 'lt'
					, value: 'now()'
				}]
			}).find().then(function(venues) {
				assert(venues.length === 19);

				done();
			}).catch(done);
		});

		it('Filtering by constant (nullable)', function(done) {
			db.event('*')
			.restrict({
				id_tenant: [{
					  type: 'constant'
					, operator: 'equal'
					, value: 1
					, nullable: true
				}]
			}).find().then(function(events) {
				assert(events.length > 30);

				if (events.some(function(evt) {
					return evt.id_tenant !== 1 && evt.id_tenant !== null;
				})) {
					throw new Error('invalid tenant id!');
				}
				done();
			}).catch(done);
		});


		it('Filtering by constant (nullable) on another entity', function(done) {
			db.venue('*').fetchEvent('*')
			.restrict({
				'event.id_tenant': [{
					  type: 'constant'
					, operator: 'equal'
					, value: 1
					, nullable: true
				}]
			}).find().then(function(venues) {

				if (venues.some(function(venue) {
					return venue.event.some(function(evt) {
						return evt.id_tenant !== 1 && evt.id_tenant !== null;
					});
				})) {
					throw new Error('invalid tenant id!');
				}
				done();
			}).catch(done);
		});
	});
