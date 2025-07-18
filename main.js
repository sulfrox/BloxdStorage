/*
Basic physical limits,
DO NOT CHANGE THESE CONSTANTS after the code has gone into production,
ESPECIALLY DON'T CHANGE THE MAXIMUM X/Z EXPANSION, as changing it changes the hash value
changing the max Y expansion wouldn't immediately break anything, but decreasing it will
worsen collision resistance and increasing it will worsen performance
*/
const BASE_STORAGE_LOCATION = [-3e5,-3e5,-3e5];
const MAXIMUM_X_DIRECTION_EXPANSION = 65536;
const MAXIMUM_Y_DIRECTION_EXPANSION = 32;
const MAXIMUM_Z_DIRECTION_EXPANSION = 65536;

//game mechanical limits. You shouldn't change these values under any circumstances (unless bloxd.io updates its chest slot count)
const MAX_SLOT_COUNT = 36-1; //need 1 slot for key storage
const MAX_DESCRIPTION_LENGTH = 476; //argument length limit for api.setStandardChestItemSlot

//restricts how many lookups the database can perform before throwing all operations to the next tick
//will be multiplied by the current number of players online
//should be higher than MAXIMUM_Y_DIRECTION_EXPANSION, but lower than 276,
//which is the experimentally determined value of allowed api.getStandardChestItemSlot() call
//numbers per tick per player
const DATABASE_LOOKUP_PER_TICK_LIMIT = MAXIMUM_Y_DIRECTION_EXPANSION+1;

//item used for storage, preferably not stackable
const STORAGE_ITEM = "Stick"

//linked list for pending read/write operations
//assuming racing conditions don't exist... use a lock if ur use case depends on it
/*
the IO operation objects should have the following structure:
{
    key:string
    slot:number
    value:string|null, new value/indicating this is a read operation if null
    callback:function
}
*/

//interruption-safe linked list with function APIs
class LinkedList {
    //whether this node should have been deleted
    //has to be modifiable by an external measure without function calls
    is_node_deleted=false;
    //whether this is the first node
    #isFirst
    //last/next node
    #last;#next;
    //value stored
    val;
    InsertAfter(val) {
        let nextNode = new LinkedList(false);
        nextNode.val = val;
        nextNode.#next = this.#next;
        nextNode.#last = this;
        this.#next = nextNode;
    }
    InsertBefore(val) {
        let nextNode = new LinkedList(false);
        nextNode.val = val;
        nextNode.#last = this.#last;
        nextNode.#next = this;
        this.#last = nextNode;
    }
    Delete() {
        this.is_node_deleted=true;
        this.#last.#next=this.#next;
        this.#next.#last=this.#last;
    }
    Next() {
        let nextNode = this.#next;
        if(!nextNode)return undefined;
        if(nextNode.is_node_deleted) {
            nextNode.Delete();
            return nextNode.Next();
        }
        if(nextNode.#isFirst)return undefined;
        return nextNode;
    }
    Last() {
        let lastNode = this.#last;
        if(!lastNode)return undefined;
        if(lastNode.is_node_deleted) {
            lastNode.Delete();
            return lastNode.Last();
        }
        return lastNode;
    }
    constructor(IsFirst=true) {
        if(IsFirst) {
            this.#isFirst=true;
            this.#last=this;
            this.#next=this;
        }
    }
}

let IO_operation_list=new LinkedList();


function vector_add(v1,v2) {
	return [
		v1[0]+v2[0],
		v1[1]+v2[1],
		v1[2]+v2[2],
	]
}

let hash_table_tick=()=>{
    let iteration_count = 0;
    let iteration_limit = api.getNumPlayers()*DATABASE_LOOKUP_PER_TICK_LIMIT;
    main_loop:for(let node=IO_operation_list.Next();node && iteration_count<iteration_limit;node=node.Next()) {
        let {key,slot,value,callback} = node.val;
        let raw_hash = FastHash(key);
        //find the hashed
        let hashed_key_x = raw_hash%MAXIMUM_X_DIRECTION_EXPANSION;
        let hashed_key_z = Math.floor(raw_hash/MAXIMUM_X_DIRECTION_EXPANSION)%MAXIMUM_Z_DIRECTION_EXPANSION;
        //look for the chest in the array of values corresponding to the hash
        try{
            for(let i=0;i<MAXIMUM_Y_DIRECTION_EXPANSION && iteration_count<iteration_limit;i++) {
                let position = vector_add(BASE_STORAGE_LOCATION,[hashed_key_x,i,hashed_key_z]);
                let raw_data;
                try {
                    raw_data = api.getStandardChestItems(position);
                    iteration_count+=1;
                } catch {
                    //assumes chunk is unloaded
                    api.getBlock(position);
                    iteration_count+=2;
                    //in-game testing shows that loading more than 1 chunk per tick
                    //can trigger the chunk loading rate limiter
                    //we don't wanna take any risk
                    break main_loop;
                }
                //the 0th slot is used to mark they key
                let real_slot = slot+1;
                if(raw_data[0]?.attributes.customDescription===key) {
                    if(value===null) {
                        let data = raw_data[real_slot]?.attributes?.customDescription;
                        safeCall(callback,data,null);
                        node.is_node_deleted=true;
                        node.Delete();
                    } else {
                        api.setStandardChestItemSlot(position,real_slot,STORAGE_ITEM,null,undefined,{customDescription:value});
                        iteration_count+=1;
                        safeCall(callback,value,null);
                        node.is_node_deleted=true;
                        node.Delete();
                    }
                    continue main_loop;
                } else if (raw_data[0]===null) {
                    if(value===null) {
                        safeCall(callback,undefined,null);
                        node.is_node_deleted=true;
                        node.Delete();
                    } else {
                        api.setBlock(position,"Chest");
                        api.setStandardChestItemSlot(position,0,STORAGE_ITEM,null,undefined,{customDescription:key});
                        api.setStandardChestItemSlot(position,real_slot,STORAGE_ITEM,null,undefined,{customDescription:value});
                        iteration_count+=3;
                        safeCall(callback,value,null);
                        node.is_node_deleted=true;
                        node.Delete();
                    }
                    continue main_loop;
                }
            }
            safeCall(callback,undefined,new Error("out of space for hash collision"));
        }catch (err) {
            safeCall(callback,undefined,new Error("unexpected failure: "+err));
        }
        node.is_node_deleted=true;
        node.Delete();
    }
}

/*
Fast JS Hash function from stack overflow https://stackoverflow.com/a/7616484
*/
function FastHash(string) {
    let hash = 0;
    for (const char of string) {
        hash = (hash << 5) - hash + char.charCodeAt(0);
        hash |= 0; // Constrain to 32bit integer
    }
    return hash;
}

function safeCall(func,...param) {
    try{
    if(typeof func==="function")(0,func)(...param);
    }catch{}
}

globalThis.BloxdStorage = {
    Get:function(key,callback,slot=0) {
        key=key+"";
        if(!Number.isInteger(slot) || slot<0 || slot>=MAX_SLOT_COUNT) {
            safeCall(callback,undefined,new Error("invalid slot number"));
            return ;
        }
        IO_operation_list.InsertAfter({key,slot,callback,value:null});
    },
    Set:function(key,value,callback,slot=0) {
        key=key+"";
        value=value+"";
        if(value.length>MAX_DESCRIPTION_LENGTH) {
            safeCall(callback,undefined,new Error("value string too long"));
            return;
        }
        if(key.length>MAX_DESCRIPTION_LENGTH) {
            safeCall(callback,undefined,new Error("key string too long"));
            return;
        }
        if(!Number.isInteger(slot) || slot<0 || slot>=MAX_SLOT_COUNT) {
            safeCall(callback,undefined,new Error("invalid slot number"));
            return ;
        }
        IO_operation_list.InsertAfter({key,slot,callback,value});
    }
}
Object.freeze(BloxdStorage);

/*
In production, you will likely want the tick function to do more than one thing,
so just call the hash_table_tick callback at the start
function tick() {
    hash_table_tick()
    //your code here
}
*/
tick=hash_table_tick;
