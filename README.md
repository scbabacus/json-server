# JSONSVR - THE API SERVER MOCKUP TOOL
JSONSVR enables you to quickly provide a mockup server that serves RESTful protocols. You write the API in `service.json` and then provide corresponding responses for each API there. The responses can be read from `.json` files, `.html` files, `.txt`, or even provided as a string. You can write Javascript expressions in the `.json` or `.html` files as well to create a template that could provide dynamic responses.

## Content
- [Running the JSON server](#running-the-json-server)
- [Configure the server using config.json](#configure-the-server-using-configjson)
- [Writing service.json](#writing-servicejson)
- [API Definition](#api-definition)
- [JavaScript Expressions](#javascript-expression)
- [JSON template](#json-template)
- [HTML template](#html-template)
- [Support of S3 Hosted Files](#support-of-s3-hosted-files)
- [The Test Library API Reference](#the-test-library-api-reference)
## Running the JSON server
``` 
npm install -g jsonsvr
jsonsvr --init
jsonsvr
```
## Configure the server using config.json
To configure the JSON server, write or modify the `config.json` file. You can pull the
bootstraping `config.json` file using the `jsonsvr --init` command.

You may specify the path for your configuration file using the `--config` parameter. 

```bash
jsonsvr --config /path/to/config.json
```

The `config.json` file example:
```json
{
  "port": "port number for the server to serve",
  "imports": {
    "module identifier": "module name"
  },
  "serviceDescriptor": "./data/service.json",
  "noDefaultIndexPage": false,
  "accessLog": "./access.log"
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

### serviceDescriptor
You may specify the location of the service descriptor file using the `serviceDescriptor` configuration parameter in `config.json` file. The content of this parameter can be
- An absolute path on local machine
- A relative path against the current working directory
- A URI describing S3 object (see [S3 Support](#support-of-s3-hosted-files) for more detail)

The bootstraping template for `service.json` can be generated using the `jsonsvr --init` command.

### noDefaultIndexPage
By default, the server will be started with the root path `/` being a documentation page (this document) if the root path was not defined in `service.json` file. You can disable this behavior by setting the `noDefaultIndexPage` to `true`, in which the server will return 404-Not Found.  

### Access Log
Set the `accessLog` to the path of a log file or a special keyword `console` to enable the full dump of requests and responses made by JSON server. In latter case, the access log is printed on the console.

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

The route path may contain parameters. JSON server uses the path parameter syntax used in express.js, which uses a colon-leaded parameter names within the route path. The parameter can later be accessed in the scripts using `ctx.request.params.<parameter>`

```json
{
  "/api/users/:userId": {
    "GET": {
      "response": "./data/user.json"
    }
  }
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
Direct the browser to the redirected URL for this API. The `redirect` parameter defines the target URL to redirect to. No query string are
being carried over from the original URL unless the `redirectQueryString` parameter is set to `true`. See [redirectQueryString](#redirectquerystring) option
for more information.

```json
{
  "GET": {
    "redirect": "http://www.google.com"
  }
}
```

#### redirectQueryString
Carry over the query string from the request to the redirected URI. Note that all the query strings from the `redirect` parameter will be replaced.

```json
{
  "GET": {
    "redirect": "http://www.google.com/"
    "redirectQueryString": true
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
Only use this particular method definition if the condition is met, i.e. the expression returns `true` or a javascript truthly value. Otherwise, return 404 or the other method definition that has its condition matched. In the latter case, an array of method definitions has to be given instead of an method definition content.

```json
{
  "GET": {
    "condition": "ctx.request.params.userId === '2931'",
    "response": "./data/user2931.json"
  }
}
```
From the example above, if the user ID does not equal 2931, a 404 error returns.

```json
{
  "GET": [
    {
      "condition": "ctx.request.params.userType === 'individual'",
      "response": "./data/individual.json"
    },
    {
      "condition": "ctx.request.params.userType === 'juristic'",
      "response": "./data/juristic.json"
    },
    {
      "response": "./data/default.json"
    }
  ]
}
```
From the example above, the `condition` is provided such that the given method definition would handle the matched case. The last definition, however, does not provide a condition. In such case the server assumes the `true` condition. The evaluation starts from the first element of the method defition array. The first method definition that either not have condition or having the condition returns true, will be used. Others will be neclected for the particular request.

> Note that giving an array of more than one method definitions does not make sense when all method definitions do not define `condition`. Doing so, only the first defition will always be excuted.

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
PreScript supports mutilple statements using array.

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
PostScript supports mutilple statements using array.

### Initialization Script
There are cases when initialization has to take place in order to prepare environments -- e.g. data structures -- for further usages. Such situations can be written as an `$init` script in the service descriptor file.

For example, to initialize the `users` array:
```json
{
  "$init": "ctx.data.users = []"
}
```
The `$init` allows multiple statements. They can be written as an array:

```json
{
  "$init": [
    "ctx.data.users = []",
    "ctx.data.sessionIndex = {}",
    "ctx.data.count = 0"
  ]
}
```

The initialization script runs only when the server starts, i.e. when the `service.json` is loaded.

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

### Use of Variables in Javascript Expressions

### The Context variable
The context variable can be accessed in the expression as a `ctx` variable. There are useful properties of this context variable that you can use. They are:

- `ctx.req` represents the current request. It is a Request instance from `expressjs` framework. Interesting properties are:
  - `ctx.req.body` provides the parsed body value. If the Content-type is `application/json` then the body is a Javascript object represents that JSON. If the Content-type is `form-data`, the body is key-value pair of param and value.
  - `ctx.req.headers` provides the HTTP request headers in key-value pairs.
  - `ctx.req.params` provides the named URI component in the route. For example, `/api/users/:username` route will have `ctx.req.params.username` be that third element of the route.
  - `ctx.req.query` provides the key-value pairs of the parsed query strings from the URI.
- `ctx.data` represents the globally accessible data where you can declare variables to use with the other  APIs.

### JSON Directives
In JSON templates, you can use **JSON Server directive** to control the fields. The JSON directive is described as a JSON object literal with the key (property name) beginning with a dollar sign (`$`) denoting the command.

#### $array directive
Used to create an array of repeating element based on the given template. 

```json
{
  "data": {
    "$array": {
      "count": 10,
      "element": "${ctx.i}"
    }
  }
}
```
The element template can include dynamic expressions as same as that applies with the JSON templates. A special variable `ctx.i` is available in the context for the element template, which contains the current iteration number.

##### Properties
- `count` The number of generated elements
- `element` The element template.

#### $exec directive
Used to execute a Javascript statements without generating values in any outputs to the target field.

For example, for this json template:
```json
{
  "field": { "$exec": "ctx.lastCall = new Date()" }
}
```
Generates the output as:

```json
{}
```

For multiple statements, use array.

```json
{
  "field": { "$exec": [
    "ctx.data.today = moment()",
    "ctx.data.tomorrow = ctx.data.today.add(1, 'days')"
  ]}
}
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
  
#### $if directive
Conditionally return the element defined in `then` property if the `condition` implies JavaScript truthly value. Otherwise, the `else` element is returned, if defined. Otherwise, the target field is eliminated.

> Note: You need to use Javascript expression `${...}` for `condition` if you plan to provide expression to evaluate rather than a constant string or a value.

```json
{
  "pricing": { 
    "$if": {
      "condition": "${data.price > 200}",
      "then": "expensive",
      "else": "inexpensive"
    } 
  },

  "errorMessage": { 
    "$if": { 
      "condition": "${data.error}",
      "then": "${data.errmsg}" 
      }
    }
}
```
> Note: Unlike the full-fleged languages, JSON-server DSL does not defer the evaluation of `then` statements to when the condition is true, as well as for an `else` when the condition evalues to false. JSON server pre-evaluates the entire JSON structure before directive evaluation so all expressions are evaluated regardless of the `condition` resulting value.

## HTML template
The current version does not support dynamic HTML content generation.

## Support of S3 Hosted Files
JSON Server supports AWS S3 hosted files in most of the configuration and descriptors that require file path. To refer to S3 stored content, simply use `s3://` URI scheme in place of the path.

For example, in `config.json` you may use:
```json
{
  "serviceDescriptor": "s3://your-s3-bucket-name/path/to/object.json"
}
```

## The Test Library API Reference
Utilities that are commonly required for convenience in creating mock API are preloaded by default. This bundle of utilities can be accessed under `lib` namespace. They can be used in any expression evaluations on both service definition file and the template files.

### lib.condition()
Use as an expression in place of `if` statement. Condition returns the `then` evaluation if the `condition` is true. Otherwise, it returns the result of `else` evaluation.
> Note: The `if` and the conditional expression in Javascript can also be used. This interface is just provided for convenience.
#### Declaration:
`lib.condition(condition: boolean, then: () => any, else: () => any): any`

#### example
```json
{
  "days": "${lib.condition(ctx.days > 30, () => days - 10, () => days + 20)}"
}
```

### lib.randomDigits()
Returns a random number or letters in the given character class as string for the given number of digits. Useful for generating random fix-length string IDs.

#### Declaration
`lib.randomDigits(len: number = 8, charClass: string = lib.CC_NUMBERS): string`

#### Parameters
- `len` **optional** number of digits to be returned
- `charClass` **optional** string of available characters to pick at random
  - The library has provided constant strings for mostly used character classes
    - `lib.CC_ALPHANUM` for Alphanumeric (numbers and capital letters, 0-9 A-Z)
    - `lib.CC_MIX_ALPHANUM` for Alphanumeric with mixed character cases (0-9 A-Z a-z)
    - `lib.CC_NUMBERS` for numeric digits (0-9)
    - `lib.CC_CAPITALS` for capital letters (A-Z)
    - `lib.CC_LOWERCASES` for lowercase letters (a-z)
    - You can also use them in mix, for example `lib.CC_LOWERCASES + lib.CC_CAPITALS`.

#### Example
```json
{
  "username": "${lib.randomDigits(lib.randomNumber(15,3), lib.CC_CAPITALS)}", 
  "password": "${lib.randomDigits(16, lib.CC_MIX_ALPHANUM + '!@#$%^&*()_-+=\\/.\\'\"<>?{}[]')"
}
```  

### lib.randomNumber
Returns the random number in the range of the given [max, min] inclusive.

#### Declaration
`lib.randomNumber(max: number = 100, min: number = 0)`

#### Parameters
- `max` **optional** maximum possible number to return, inclusive. Default to 100
- `min` **optional** minimum possible number to return, inclusive. Default to 0

#### Example
```json
{
  "price": "USD ${lib.randomNumber(100)}",
  "height": "${lib.randomNumber(210, 140)} cm"
}
```

