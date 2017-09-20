---
title: Plugins Quickstart
permalink: /docs/plugins/quickstart/
---

This tutorial walks through the mechanics of creating and publishing a Talk
plugin. Along the way I call out some particular habits and techniques that I
employ. If you have other practices that you find valuable, please don't
hesitate to
[contribute!]({{ "/docs/faq" | absolute_url }}#how-do-i-contribute-to-these-docs)

We will create a plugin that exposes a route that allows assets to be created or
updated.

## Setup the environment

Before I begin working on the plugin, I've installed
[Talk from source]({{ "/docs/development/tools" | absolute_url }}).

### Watch the Server

In a terminal, I run `yarn dev-start`. This:

* starts my server, showing plugin and configuration information
* restarts it when I save files
* shows my temporary `console.log()` statements
* shows real time access logs
* shows verbose debug output if enabled (more on this later)

### Watch the Client build process

In a separate terminal I run `yarn build-watch`. This:

* builds the client side javascript bundles
* watches relevant files and rebuilds the bundle on change
* displays _compile time_ errors, including (the many) syntax errors I cause

If you need to run `yarn install`, you will see missing module error messages
here.

### Watch from the Browser

I open up `http://localhost:3000` in a web browser and see the default comment
stream. I then open the dev tools console, which:

* shows any _run time_ errors/warnings generated on the front end.
* shows any temporary `console.log()` statements I add during development.

I also often toggle to the Network Tab to see:

* which files are being loaded
* requests sent from my front end code, including headers, the payload/queries
  sent and the data returned

I strongly recommend taking the time to fully explore all the features of your
browser's dev tools!

## Create a home for my new plugin

My goals for this tutorial are to:

* build this plugin locally
* use source control and publish for collaboration
* publish the plugin as an npm library

### Create a repo

I create a new repo called `talk-plugin-asset-manager`. (I use github, but this
you could store this anywhere, bitbucket, svn, etc...)

_make sure to respect the naming convention `talk-plugin-*`. This will allow for
easy identification of the repo and, eventually, easy searching on npm._

### Set up a local file structure

In a blatant rip off from the Golang community, I create an environment var to
hold the path to the root of my Coral directory. This allows absolute pathing.

```
export CORALPATH=/path/to/my/coral/root/dir
```

I like to put my plugins in a directory next to talk, but you could put this
anywhere.

```
cd $CORALPATH
git clone https://github.com/jde/talk-plugin-asset-manager.git
```

### Register your plugin

Add the plugin to the plugins.json file:

```json
{
  "server": [
    ...
    "talk-plugin-asset-manager"
  ],
  "client": [
    ...
    // no client side components so I won't add it here
  ]
}
```

But wait! Talk looks in `talk/plugins/[plugin-name]` for plugin code. Why couldn't we just add that plugin there?

We could have.

This would make it _a little_ easier to register, but _a lot_ harder to cleanly manage in version control. In order to avoid it being sucked into your Talk repo, you would have to manually `.gitignore` it or use sub modules or something similar.

As a user of a Linux_y_ os, I prefer to create a symbolic link.

```bash
cd $CORALPATH/talk/plugins
ln -s $CORALPATH/talk-plugin-asset-manager
```

Now, as far as Talk knows, our plugin is right there in the folder. Git is wise, however, and will not include it in the Talk repo. Best of all, our `yarn dev-start` based watch statement follows symbolic links and will restart our sever each time a file is saved.

### Create the initial index file

All plugins contain server and/or client index files, which export all plugin functionality.

```js
// talk-plugin-asset-manager/index.js
module.exports = {};
```

## Build the feature!

Now that the plugin is set up I can get down to writing the feature. My goal is to allow my CMS to push new assets as they are created into Talk. To accomplish this, I will create a POST endpoint using Talk's [route api]({{ "/docs/plugins/server" | absolute_url }}#field-router).

### Create a route

When designing my api, I want to be careful to avoid conflicts with not only the existing Talk api, but other plugins in the open source ecosystem that may be creating routes. To do this, I'll follow the golden rule of creating universals with plugins:

_Always namespace all universals with your plugin's unique name._

To ensure everything is hooked up, I'll log the request body (POST payload in this case) to the console and echo it as the response:

```js
// talk-plugin-asset-manager/index.js
module.exports = {
  router(router) {
    router.post('/api/v1/asset-manager', (req, res) => {
      console.log(req.body);
      res.json(req.body);
    });
  }
}
```

When I save this file, I reflexively check my console to be sure that the server restarts.

To test that this works, I can:

```bash
curl -H "Content-Type: application/json" -X POST -d '{"id": "123", "url":"http://localhost:3000/my-article","title":"My Article"}' http://localhost:3000/api/v1/asset-manager
```

After hitting the endpoint, I can also look at the terminal running `yarn dev-start` and see my `console.log()` and the access log:

```
{ url: 'http://localhost:3000/my-article',
  title: 'My Article' }
POST /api/v1/asset-manager 200 1.379 ms - 68
```

### Save the asset

When I save this asset, I will use Talk's [asset model](https://github.com/coralproject/talk/blob/master/models/asset.js).

Mongo has a handy method [findOneAndUpdate](https://docs.mongodb.com/v3.2/reference/method/db.collection.findOneAndUpdate/) that will take care determining whether or not this asset exists, then either updating or inserting it. Whenever possible, we recommend using these atomic patterns that prevent multiple queries to the db and the efficiency problems and race conditions that they cause.

```js
// talk-plugin-asset-manager/index.js

const AssetModel = require('models/asset');
const authz = require('middleware/authorization'); // (1)

module.exports = {
  router(router) {
    router.post('/api/v1/asset-manager', authz.needed('ADMIN'), async (req, res, next) => { // (2)

      const query = {
        id: req.body.id, // (3)
      };
      const update = {
        $set: req.body, // (4)
      };

      try {
        const asset = await AssetModel.findOneAndUpdate(query, update, {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        });

        return res.json(asset); // (5)
      } catch (err) {
        return next(err); // (6)
      }
    });
  }
}
```

Lots of changes! We'll go over the big sections one by one:

1. In order to secure access to these protected endpoints, we need to add an
   authorization layer (middleware), Talk provides this at
   `middleware/authorization`.
2. We now enforce that any user hitting this endpoint is an Admin user. We'll
   cover how you can create a token to do this later.
3. We are expecting that the body will contain an ID, this will be used to
   upsert the asset into our database. If an asset with the provided ID is not
   found, we'll create it!
4. We are expecting that the rest of the body will contain the remainder of the
   fields that should be set on the target document.
5. We return the asset as JSON to the caller, this makes it easy to verify that
   the operation completed.
6. If an error occurred, we need to catch it, and return it to the `next`
   callback handler. See the [Express Documentation](https://expressjs.com/en/4x/api.html#res)
   for more details on interacting with handlers.

Now because we added the authorization middleware, we need to generate a token
for authenticating. We can do this by setting up the server, creating a user,
and a token:

```bash
# You'll have to answer some questions, but when we're done, it'll print
# something like `User <user id> created.` take note of that ID, as we'll be
# using it next.
$ ./bin/cli -c .env setup

# Replace $USER_ID with the ID from the previous step. It will print something
# like `Created Token[<token id>] for User[$USER_ID] = <token>` take a note
# of that `<token>`, as it will only be displayed once.
$ ./bin/cli -c .env token create $USER_ID curl-example

# Now completing the curl example from before, with some modifications. Replace
# $TOKEN with the token from the previous step.
$ curl -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -X POST -d '{"id": "123", "url":"http://localhost:3000/my-article","title":"My New Article"}' http://localhost:3000/api/v1/asset-manager
```

You can now see that the curl command we executed has successfully changed the
title of the asset!

Lastly, I can see the asset in the admin panel at `http://localhost:3000/admin`
as well as in my database.

We have an alpha version of our plugin!

### More work to be done

The purpose of this tutorial is to follow the full lifecycle of a plugin, from
conception through publication into deployment. With that in mind we'll move
forward with this alpha version.

Some things to make this production ready:

* refactoring to separate concerns
* commenting
* adding tests
* validating data
* [adding security](https://github.com/coralproject/talk/blob/b805451d376d2892c81c58d8822a85563e469b88/routes/api/users/index.js#L14)
* incorporating [domain whitelisting](https://github.com/coralproject/talk/blob/b805451d376d2892c81c58d8822a85563e469b88/services/assets.js#L60).

It is important to realize that when you're writing a Talk plugin you are writing a program that may be touched by other devs and could grow in size and complexity. Bring your best engineering sensibilities to bear.

## Publishing the plugin

### Publish to npm

In order to [register]({{ "/docs/plugins" | absolute_url }}#plugin-registration) your _published_ plugin, you will need to [publish it to npm](https://docs.npmjs.com/getting-started/publishing-npm-packages).

Once the package is published, update `plugins.json` to use the published plugin:

```json
{
  "server": [
    // ...
    {"talk-plugin-asset-manager": "^0.1"}
  ],
  // ...
}
```

Finally, run the `reconcile` script to install the plugin from npm.

```bash
$ bin/cli plugins reconcile
```

Once you've taken this step, anyone can register your plugin into their Talk server! Thank you for contributing to the open source community!

### Publish to version control

This plugin is open source, so I'm also going to [publish it to github](https://github.com/jde/talk-plugin-asset-manager/commit/66b626caa85cb8030b3ddaa7c1a4821bf01e350a) and [cut a release](https://github.com/jde/talk-plugin-asset-manager/releases/tag/v0.1) that mirrors the npm release.
