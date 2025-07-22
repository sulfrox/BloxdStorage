# BloxdStorage
A 32-bit Hash Table Key-Value pair storage system for bloxd.io

**NOTE THAT THIS SYSTEM IS SPECIFICALLY DESIGNED FOR A GAME ENGINE. IF YOU ARE LOOKING FOR CODE TO USE IN IRL PRODUCTION, LOOK SOMEWHERE ELSE**

## Usage
BloxdStorage is designed to be similar to LocalStorage, except that it uses callbacks and the keys/values stored cannot be longer than 476 characters.

To set the value for a key, use `BloxdStorage.Set()` e.g.

```js
BloxdStorage.Set("key","value",
    (_,err)=>{
        if(err!==null) {
            console.log("error encountered: "+err)
        }
    }
);
```

The first argument to `BloxdStorage.Set()` should be the key, the second argument should be the value that needs to be stored, and the third argument would be the callback function.

Two arguments will be delivered to the callback function: the value stored for that key before this `Set()` call (will be `undefined` if the key doesn't exist, otherwise it would be a string), and any error that may have occured. If there is no error, the second argument will be `null` (**NOT `undefined`!**). If there is an error, the first argument should always be `undefined`.

To read the value of a key, use `BloxdStorage.Get()` e.g.

```js
BloxdStorage.Get("key",
    (value,err)=>{
        if(err!==null) {
            console.log("error: "+err);
        } else {
            console.log("value: "+value);
        }
    }
)
```

Similar to `BloxdStorage.Set()`, the first argument needs be the name of the key and the second argument needs be the callback function. The first argument delivered to the callback function would similarly be the value stored for that key (will be `undefined` if the key doesn't exist, otherwise it would be a string) and the second argument will be any error that has occured(`null` if there's no error). If there is an error, the first argument should always be `undefined`

Note that both the key and the value will be converted to a string if they aren't already themselves.

More advancedly, you can specify the chest item slot number 0-34 in both `Get()` and `Set()` operations. However, this is **deprecated** and may not be supported in future updates.

```js

BloxdStorage.Set("key","value",
    (_,err)=>{
        if(err!==null) {
            console.log("error encountered: "+err)
        }
    }, 5
);
```

or

```js
BloxdStorage.Get("key",
    (value,err)=>{
        if(err!==null) {
            console.log("error: "+err);
        } else {
            console.log("value: "+value);
        }
    }, 5
)
```

## How To Install

If you don't need tick functionality, just paste the contents of `BloxdStorage.min.js` in the release files at the start of your world code and you will be good to go.

If you need to use the `tick` function, however, you need to call `hash_table_tick()` at the start of your tick function e.g.

```js
function tick() {
    hash_table_tick();
    //do other things
}
```

## How It Works

This storage system occupies a 35536\*32\*35536 chunk of space in the void and stores data in chests. The indexing uses a 32-bit hash table, where the first 16 bits is the relative z coordinates and the last 16 bit is the relative x coordinate. the 32 possible blocks in the Y direction is used in case a hash collision happens and more than 1 key has the same hash (so the system can handle at most 32 keys having the same hash).

**Note: Since the hash used is insecure, to avoid denial-of-service attacks based on hash collision, you should never use a user-generated string as a key. For now it is recommended to only use players' DbIds as storage keys, as they are distributed from a centralized source \(the Bloxd.io Devs\). Future versions might generate a random nonce the first time the script gets loaded into a new lobby to reduce the probability of this kind of attack. However, even in that case it might still be possible for a potential attacker to guess the value of this nonce through time-based attacks and knowledge in the pseudorandom number generator used by Bloxd.io**
