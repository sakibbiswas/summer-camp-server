const express = require('express')
const app = express()
const cors = require('cors')

const port = process.env.PORT || 3000;
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require("stripe")(process.env.payment_secret_key)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Middlewire

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.db_users}:${process.env.db_pass}@cluster0.yk6uldw.mongodb.net/?retryWrites=true&w=majority`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    //bearer token
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.access_token_secret, (error, decoded) => {
        if (error) {

            return res.status(401).send({ error: true, message: 'unauthorized access' })

        }

        req.decoded = decoded;

        next()
    })
}
async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const UsersCollection = client.db("summerdb").collection("users");
        const selectCollection = client.db("summerdb").collection("select");
        const classCollection = client.db("summerdb").collection("classes");
        const PaymentsCollection = client.db("summerdb").collection("payments");
        // jwt 
        app.post('/jwt', (req, res) => {
            const user = req.body;

            const token = jwt.sign(user, process.env.access_token_secret, { expiresIn: '1h' })
            res.send({ token })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await UsersCollection.findOne(query)
            if (user?.role !== 'admin') {

                return res.status(403).send({ error: true, message: 'forbidden ' })
            }
            next()
        }

        // users related api 
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await UsersCollection.find().toArray();
            res.send(result)
        })
        app.post('/users', async (req, res) => {
            const user = req.body;

            const query = { email: user.email, status: user.status }
            const existingUser = await UsersCollection.findOne(query)

            if (existingUser) {
                return res.send({ message: 'user Already exists' })
            }
            const result = await UsersCollection.insertOne(user)
            res.send(result)
        });

        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await UsersCollection.findOne(query)
            const result = { admin: user?.role === 'admin' }
            res.send(result)


        })

        app.get('/users/instructor/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await UsersCollection.findOne(query)
            const result = { instructor: user?.role === 'instructor' }
            res.send(result)


        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await UsersCollection.updateOne(filter, updateDoc)
            res.send(result)
        });

        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;

            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };
            const result = await UsersCollection.updateOne(filter, updateDoc)
            res.send(result)
        });

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;

            const query = { _id: new ObjectId(id) }
            const result = await UsersCollection.deleteOne(query)
            res.send(result)
        })


        //class related api
        app.get('/class', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result)
        })
        // verifyAdmin,
        app.post('/class', verifyJWT, verifyAdmin, async (req, res) => {
            const newClass = req.body;
            const result = await classCollection.insertOne(newClass)
            res.send(result)
        })


        app.delete('/class/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classCollection.deleteOne(query)
            res.send(result)
        })


        // select related api
        app.get('/select', verifyJWT, async (req, res) => {
            const email = req.query.email;
            console.log(email);
            if (!email) {
                res.send([])
            }
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return req.status(403).send({ error: 1, message: 'forbidden access' })
            }
            const query = { email: email };
            const result = await selectCollection.find(query).toArray();
            res.send(result)
        })
        // step 1
        app.post('/select', async (req, res) => {
            const set = req.body;
            const result = await selectCollection.insertOne(set)
            res.send(result)
        })
        // step 2
        app.delete('/select/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await selectCollection.deleteOne(query)
            res.send(result)
        })

        // create payment intent  verifyJWT,
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            console.log(paymentIntent);

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });
        // payment related api verifyJWT,
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            console.log(payment);
            const insertResult = await PaymentsCollection.insertOne(payment)
            const query = {
                _id: { $in: payment.selectedclass.map(id => new ObjectId(id)) }
            }
            const deleteResult = await selectCollection.deleteMany(query)
            res.send({ insertResult, deleteResult })
        })

        app.get('/enrolled', async (req, res) => {

            const result = await PaymentsCollection.find().toArray();
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('camp is running');
})

app.listen(port, () => {
    console.log(` camp API is running  on port : ${port}`);
})