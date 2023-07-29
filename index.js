const express = require('express');
const cors = require('cors');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


const jwt = require('jsonwebtoken')
require('dotenv').config();


const port = process.env.PORT || 5000;



// midleware 
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uk5kj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// Create a MongoClient with a MongoClientOptions object to set the Stable API version


async function verfiyJWT(req, res, next) {

  const authHeader = req.headers.authorization;
  console.log('authHeader', authHeader);
  if(!authHeader){
    return res.status(401).send({ error:true, message: 'unauthorized access' });
  }
  const token = authHeader.split(' ')[1];

  // console.log(token);
  // jwt.verify(token, process.env.ACCESS_TOCKEN, function(err, decoded){
  jwt.verify(token, process.env.ACCESS_TOCKEN, function(err, decoded) {
   if(err){
        return res.status(401).send({message: "forbidden access", err})
   }
   req.decoded = decoded;
   next();

  })
  
}



async function run() {
  // const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uk5kj.mongodb.net/?retryWrites=true&w=majority`;
  
  // const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true});

  try {    
    await client.connect();
    const appointmentOptions = client.db('doctor_portTest').collection('AppointmentOptions');
    const bookingsCollection = client.db('doctor_portTest').collection('bookings');
    const usersCollection = client.db('doctor_portTest').collection('users');
    const doctorsCollection = client.db('doctor_portTest').collection('doctorCollection');

    // use Agregate to query multiple collection and then 
    app.get('/appointmentOptions', async(req, res)=>{


      const date = req.query.date;
      const query = {};
        const options = await appointmentOptions.find(query).toArray(); 
        // get the bookings of the provided date 
        const bookingQuery = { appointmentDate: date };
        const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
        //code carefully 
        options.forEach(option =>{
          const optionBook = alreadyBooked.filter(book => book.treatment === option.name);
          const bookedSlots = optionBook.map(book => book.slot);
          const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
          option.slots = remainingSlots; 
          
        })

        res.send(options);
    } );

    app.get('/appointmentSpeciality', async(req, res)=>{
      const query = {};
      const result = await appointmentOptions.find(query).project({name:1}).toArray();
      res.send(result)
    })


    app.get('/bookings', verfiyJWT, async(req, res)=>{ 
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      
      console.log('email', email);
      console.log('decodedEmail', decodedEmail);
    
      const query = { email: email };

      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    // Api naming conventio


  app.post('/bookings', async(req, res)=>{
    const booking = req.body;

    const query = {
      appointmentDate: booking.appointmentDate,
      email: booking.email,
      treatment: booking.treatment
    }
    const alreadyBooked = await bookingsCollection.find(query).toArray();
    if(alreadyBooked.length){
      const message = `You already have a booking on ${booking.appointmentDate} ${booking.treatment}`

      return res.send({acknowledged: false ,message})
    }

    const result = await bookingsCollection.insertOne(booking);

    res.send(result);
  });

  // app.get('/jwt', async(req, res)=>{
  //   const email = req.query.email;
  //   const query = {email: email};

  //   console.log('email', email);
  //   console.log('query', query);
    
  //   const user = await usersCollection.findOne(query);
  //   if(user){
  //     const token = jwt.sign(email, process.env.ACCESS_TOCKEN, {expiresIn: '1h'})
  //     return res.send({accessTocken: token});
  //   }
  //   res.status(403).send({accessTocken: ''})
  // });

  app.post('/jwt', (req, res)=>{
    const email = req.body.email;

    const token = jwt.sign({email}, process.env.ACCESS_TOCKEN, { expiresIn: '2 days' });
    res.send({accessTocken: token })
  });
  
  app.get('/jwt', (req, res)=>{
    const email = req.body.email;
    // console.log(email);
    const token = jwt.sign({email}, process.env.ACCESS_TOCKEN, { expiresIn: '2 days' });
    res.send({accessTocken: token })
  });


  app.get('/users', async(req, res)=>{
    const query = {};
    const users = await usersCollection.find(query).toArray();

    res.send(users);
  });

  app.post('/users', async (req, res)=>{
    const user = req.body;
    const result = await usersCollection.insertOne(user);
    res.send(result)
  });
  
  // app.delete('/users/:id', async (req, res)=>{
  //   const id = req.params.id;
  //   const query = { _id: new ObjectId(id) };

  //   const user = await usersCollection.deleteOne(query);

  //   if (user.deletedCount === 1) {
  //     console.log("Successfully Deleted");

  //   }else{
  //     console.log("Not Matched");
  //   }

  //   res.send(user)
  // })

  app.get('/users/admin/:email', async (req, res)=>{
    const email = req.params.email;

    const query = { email };
    const user = await usersCollection.findOne(query);
    
    res.send({ isAdmin: user?.role === "admin" });
  })

  app.put('/users/admin/:id', verfiyJWT, async(req, res)=>{
    const decodedEmail = req.decoded.email;
    const query = {email: decodedEmail};
    const user = await usersCollection.findOne(query);
    
    if(user?.role !== 'admin'){
      return res.status(403).send({message: 'Forbidden access'})
    }

    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const options = { upsert: true };
    const updatedDoc = {
      $set:{
        role: 'admin'
      }
    }
    const result = await usersCollection.updateOne(filter, updatedDoc, options);
    res.send(result);
  });

  app.post('/doctors', async(req, res)=>{
    const doctor = req.body;
    const result = await doctorsCollection.insertOne(doctor);

    res.send(result);
  });
  app.get('/doctors', async(req, res)=>{
    const query = {};
    const allDoctors = await doctorsCollection.find(query).toArray();

    res.send(allDoctors);
  })
  app.get('/favicon.ico', (req, res) => res.status(204));


  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', async(req, res)=>{
  res.send('Doctors Portal Server Running');


});


app.listen(port, ()=>console.log(`Doctors Running ${port}`))
