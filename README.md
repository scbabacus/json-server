# THE JSON SERVER MOCKUP TOOL
JSON server enables you to quickly provide a mockup server that serves RESTful protocols. You write the API in `service.json` and then provide corresponding responses for each API there. The responses can be read from `.json` files, `.html` files, `.txt`, or even provided as a string. You can write Javascript expressions in the `.json` or `.html` files as well to create a template that could provide dynamic responses.

## Running the JSON server
- Ensure you have `ts-node` installed. issue `npm install -g ts-node` before advancing to the next step.

```
sudo npm install -g ts-node 
npm install
npm start
```
## Configure the server using config.json
To configure the JSON server, write or modify the `config.json` file.
```json
{
  "port": "port number for the server to serve",
  "imports": {
    "module identifier": "module name", ...
  },
  "serviceDescriptor": "./data/service.json"
}
```

### Port
The port number to which the server is served on.

### Imports
An optional `imports` configuration allows you to load the node modules specified by `module name`. Once successfully imported at startup, you may refer to this module inside the `.json` or `.html` files using the `module identifier`. For example:

in `config.json`:
```json
{
  ...
  "modules": {
    "moment": "moment",
    "uu": "uuid",
    "lo": "lodash"
  }
}
```

in `orders.json`:
```json
{
  "trackingId": "$ctx.trackingId = uu.v4()",
  "created": "$moment()",
  "expire": "$moment().add(30, 'days')",
  "$exec": "$ctx.orderIndex.push(ctx.trackingId); ctx.orderIndex = lo.uniq(ctx.orderIndex)"
}
```

> Note: You'll need to issue `npm install <module>` to install external modules before being able to import them to the service.

## Writing service.json
You create `service.json` file to define APIs. The `service.json` file is loaded when the server starts. It is located at `./data/services.json` by default. However, you can specify the different location in `serviceDescriptor` property on the `config.json` file. You may need to restart the server if you made changes to the service descriptor file.

To define an API, use the *route path* as a key. Under the route path key, defines the HTTP methods, i.e. `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`, `PATCH`, `HEAD` etc. A special method `*` can also be specified if you want the route path to serve for every HTTP methods.

```json
{
  "/api/orders": {
    "GET": {
      "response": "./data/orders.json"
    },
    "POST": {
      "response": "./data/orders_result.json"
    }
  },

  "/api/users": {
    "GET": {
      "response": "./data/users.json"
    }
  }
}
```

The route path may contain parameters. Json server uses the path parameter syntax used in express.js, which uses a colon-leaded parameter names within the route path. The parameter can later be accessed in the scripts using `ctx.request.params.<parameter>`

```json
{
  "/api/users/:userId": "./data/user.json"
}
```

in `user.json`:
```json
{
  "userId": "${ctx.request.params.userId}"
}
```

You may use the variables in service definition file, such as in path. 

```json
{
  "/api/users/:userId": {
    "GET": {
      "response": "./data/${ctx.request.params.userId}/user.json"
    }
  }
}
```

### API definition
Several ways to define a response for an API described in `service.json` file. You must define one of the following response types for an API in order to get it to function. 

- `response` - read from a file
- `errorResponse` - respond with HTTP status code
- `redirect` - respond with 301 status code with redirect URL
- `textResponse` - response with the given text

> Note: The response types are mutual exclusive. They cannot be used together in a single API method. 

#### response
Respond with the content of the specified file. The currently supported files are: `.json`, `.html`, and `.txt`. 

```json
{
  "GET": {
    "response": "./data/response.json"
  }
}
```

#### errorResponse
Respond with the given HTTP status code.

```json
{
  "GET": {
    "errorResponse": "500"
  }
}
```

#### redirect
Direct the browser to the redirected url for this API.

```json
{
  "GET": {
    "redirect": "http://www.google.com"
  }
}
```

#### textResponse
Respond with the given text

```json
{
  "GET": {
    "textResponse": "Hello"
  }
}
```
You may use javascript expression in textResponse. See [javascript expression](#javascript-expression) for more details.

#### condition
Only use this particular definition if the condition is met, i.e. the expression returns `true` or javascript truthly value.

```json
{
  "GET": {
    "condition": "ctx.request.params.userId === '2931'",
    "response": "./data/user2931.json"
  }
}
```

#### headers
Define response headers

```json
{
  "GET": {
    "headers": {
      "Content-type": "text/html",
      "Set-cookie": "session=29222"
    }
  }
}
```

#### preScript
Provide Javascript to run before response is sent. The script is provided as a `string`.

> Note: You do not need to use expression directive `${...}` in the `preScript` value.

```json
{
  "/api/query": {
    "*": {
      "preScript": "ctx.data.queries = []",
      "response": "./data/query-result.json"
    }
  }
}
```

#### postScript
Provide Javascript to run after the response is sent. The script is provided as a `string`.

> Note: You do not need to use expression directive `${...}` in the `postScript` value.

```json
{
  "/api/product": {
    "*": {
      "response": "./data/product.json",
      "postScript": "ctx.data.summary = Math.round(ctx.data.price)"
    }
  }
}
```

## Javascript Expression
To allow dynamic generation of content or configuration, you may use javascript expression in your json values. The expression can be defined inside `${...}` directive and can be used in mixed with the string value. 

The following is an example of how expressions can be used:
```json
{
  "values": "${a}, ${b}, ${c}",
  "average": "${(a + b + c)/3}"
}
```

> Note: If the expression spans an entire string value, the type of result will be that of the result of the expression. For example, if your expression returns a number, the property value will be a number. If you need the expression that returns numeric (or other primitive types such as boolean, null, or undefined) to be represented as a string, use the `String(...)` function. For example, `"values": "${String(true)}"` would be interpolated to `"values": "true"`, while the `"values":"${true}"` results in `"value": true`.

## JSON template
The JSON files you defined in the `service.json` file as the values to the `response` property are JSON templates. A JSON template can be a static content, having no expressions or directives, or dynamic, with expressions and/or directives within them. The dynamic generation of JSON file according to the template is a powerful feature of JSON server, which enables you to generate test cases that work for you.

### The Context variable
The context variable can be accessed in the expression as a `ctx` variable. There are useful properties of this context variable that you can use. They are:

- `ctx.request` represents the current request. It is a Request instance from `expressjs` framework.
- `ctx.data` represents the globally accessible data where you can declare variables to use with the other  APIs.

### JSON Directives
In JSON templates, you can write a **JSON directive**. The JSON directive is described as a JSON object literal with the key (property name) beginning with a dollar sign (`$`).
Currently, the supported directives include `$array` and `$exec`.

#### $array directive
Used to repeatedly create an array of supplied element template. 

```json
{
  "data": {
    "$array": {
      "count": number,
      "element": string | object | any types
    }
  }
}
```
The element template can include dynamic expressions as same as that applies with the JSON templates. A special variable `ctx.i` is available in the context for the element template, which contains the current iteration number.

#### $exec directive
Used to execute a Javascript statement without generating values in any outputs.

> Note: You do not use string interpolation marker `${...}` for a statement provided to `$exec`

For example, for this json template:
```json
{
  "$exec": "ctx.lastCall = new Date()"
}
```
Generates the output as:

```json
{}
```

#### $csv directive
Reads records in a CSV file to create an array of templated elements.

```json
{
  "$csv": {
    "file": "file path",
    "element": "string, object, or any types",
    "firstLineHeader": false,
    "headers": "optional string array of header variable names, defined in the same sequence againt columns",
    "delimiter": "optional delimiter. Default to comma"
  }
}
```
parameters:
- `file` Specifies path to the CSV file.
- `element` Defines the element template. Can be a string (with expressions), object, or any types.
- `firstLineHeader` Set to true if the first line on the CSV file defines header. If so, the headers will be used as a subscript to `col` in the context variable. Default to `false`.
- `headers` Array of header names to override CSV file header, or when they are absent. The headers will be used as a subscript to `col` in the context variable.
- `delimiter` A field delimiter for this CSV file.

## HTML template
The current version does not support dynamic HTML content generation.

## The Test Library API Reference
Utilities that are commonly required for convenience in creating mock API are preloaded by default. This bundle of utilities can be accessed under `lib` namespace. They can be used in any expressions evaluation on both service definition file and the template files.

### lib.condition()
Use as an expression in place of `if` statement. Condition returns the `then` evaluation if the `condition` is true. Otherwise, it returns the result of `else` evaluation.
#### Declaration:
`lib.condition(condition: boolean, then: () => any, else: () => any): any`

### example
```json
{
  "days": "${lib.condition(ctx.days > 30, () => days - 10, () => days + 20)}"
}
```

### lib.randomDigits()
Returns a random number as string for the given number of digits. Useful for generating random fix-length string IDs.

### Declaration:
`lib.randomDigits(len: number = 8): string`
