const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')


const stripe = require("stripe")('sk_test_51OHJIpIAC5sTC0XPOMIbEeQFZSUYVBTWa08zrIQvr0rbTlenJDXFpvfG8uQaXEAhaAoR8o8ai1JHmPK9Q2gPlv9p00K7s6jP03');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()




// middleware
app.use(cors({
  origin: ['http://localhost:5173'], credentials: true
}))
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hif0lwq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db('jobtask').collection('users')
    const recipeCollection = client.db('jobtask').collection('recipes')


    // auth related api
    app.post('/jwt',async (req, res)=>{
        const user = req.body
        const token = jwt.sign(user, process.env.ACCESS_SECRET_TOKEN, {
          expiresIn: '1h'
        })
        res.send({token})
       
      })

// middlewares
 const verifyToken = (req, res, next)=>{
  if(!req.headers.authorization){
    return res.status(401).send({message: 'forbidden access'})
  }
  const token = req.headers.authorization.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, decoded)=>{
    if(err){
      return res.status(401).send({message: 'forbidden access'})
    }
    req.decoded= decoded
  })
  next()
 }


      // user api
      app.post('/users' , async (req, res)=>{
        const user = req.body
        const query = {email: user.email}
        const existingUser = await userCollection.findOne(query)
        if(existingUser){
          return res.send({message: 'user already exists', insertedId: null})
        }
        const result = await userCollection.insertOne(user)
        res.status(401).send({
          success: true,
          message: 'User is created  successfully',
          data: result
        })
  
      })
// all users
      app.get('/users', async (req, res)=>{
        const result = await userCollection.find().toArray()
        res.send(result)
      })

      // single user
      app.get('/users/:email', async (req, res) => {
        const { email } = req.params;
        
        try {
          const user = await userCollection.findOne({ email });
          res.send(user);
        } catch (error) {
          res.status(500).send({ success: false, message: 'Failed to fetch user data', error: error.message });
        }
      });
      
      // recipe api

      app.post('/recipes', async (req, res)=>{
        const recipe = req.body
        const result = await recipeCollection.insertOne(recipe)
        res.send({
          success: true,
          message: `${recipe.name} added to database`,
          data: result
        })
      })

      app.get("/recipes", async (req, res) => {
        try {
          const { category, country, search } = req.query;
          const filter = {};
  
          if (category) {
            filter.category = new RegExp(category, "i");
          }
          if (country) {
            filter.country = new RegExp(country, "i");
          }
          if (search) {
            filter.name = new RegExp(search, "i");
          }
  
          const recipes = await recipeCollection
            .find(filter)
            .project({ name: 1, image: 1, purchased_by: 1, creatorEmail: 1, country: 1 })
            .toArray();
  
          res.json({
            data: recipes,
          });
        } catch (error) {
          res.status(500).send({
            success: false,
            message: "Failed to fetch recipes",
            error: error.message,
          });
        }
      });
      
      
      // single recipe
      app.get('/recipes/:id',verifyToken, async (req, res)=>{
        const recipeId = req.params.id
        const query = {_id : new ObjectId(recipeId)}
        const result = await recipeCollection.findOne(query)
        res.send(result)
      })

      // React to a recipe
// Add a reaction
app.post('/recipes/:id/reactions', verifyToken, async (req, res) => {
  const recipeId = req.params.id;
  const { email, type } = req.body;
  const query = { _id: new ObjectId(recipeId) };
  const update = { $push: { reactions: { email, type } } };
  const result = await recipeCollection.updateOne(query, update);
 
  res.send(result);
});

// Remove a reaction
app.delete('/recipes/:id/reactions', verifyToken, async (req, res) => {
  const recipeId = req.params.id;
  const { email } = req.body;
  const query = { _id: new ObjectId(recipeId) };
  const update = { $pull: { reactions: { email } } };
  const result = await recipeCollection.updateOne(query, update);
  res.send(result);
});

  
      
      
    //  purchase recipe
    app.post('/purchase-recipe', async (req, res) => {
      const { userEmail, recipeId } = req.body;

    
      try {
        // Find the user and recipe in the database
        const user = await userCollection.findOne({ email: userEmail });
    
        const recipe = await recipeCollection.findOne({ _id: new ObjectId(recipeId) });
  
    
        // Update the user's coins, the recipe creator's coins, and the recipe itself
       const updatedCoin= await userCollection.updateOne({ email: userEmail }, { $inc: { coin: -10 } });
 
       const addCoin=  await userCollection.updateOne({ email: recipe.creatorEmail }, { $inc: { coin: 1 } });
  
       const updatedPurchase=  await recipeCollection.updateOne({ _id: new ObjectId(recipeId) }, {
          $addToSet: { purchased_by: user.email },
          $inc: { watchCount: 1 }
        });

        // Send a success response
        res.send(updatedPurchase);
      } catch (error) {
        // Handle errors and send an error response
        res.status(500).send({ success: false, message: 'Failed to purchase recipe', error: error.message });
      }
    });
    
      // payment related api
      app.post('/create-payment-intent', async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);
  
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card']
        });
  
        res.send({
          clientSecret: paymentIntent.client_secret
        })
      });
      
      app.post('/update-coins', async (req, res) => {
        const { email, coins } = req.body;
        const result = await userCollection.updateOne({ email }, { $inc: { coin: coins } });
        if (result.modifiedCount > 0) {
          res.send({ success: true });
        } else {
          res.status(500).send({ success: false, message: 'Failed to update coins' });
        }
      });
      
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res)=>{
    res.send('Flavor Fusion Server is Running')
})

app.listen(process.env.PORT, ()=>{
    console.log(`Flavor Fusion Server is Running on port ${process.env.PORT}`);
})
