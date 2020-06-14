const { Command, flags } = require('@oclif/command');
// Smaller bundle size, dealing only with the low-level library
const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');
const { cli } = require('cli-ux');
const WebSocket = require('ws');
const inquirer = require('inquirer');
const url = require('url');

const endpoint = 'wss://ws.binaryws.com/websockets/v3?app_id=17044';

const ws = new WebSocket(endpoint);
// eslint-disable-next-line camelcase
const api = new DerivAPIBasic({ app_id: 17044, connection: ws });

const isURL = (str) => {
  const urlRegex = '^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$';
  const url = new RegExp(urlRegex, 'i');
  return str.length < 2083 && url.test(str);
};

class AppIdUpdaterCommand extends Command {
  // static flags = {
  //   stage: flags.string({options: ['development', 'staging', 'production']}),
  // }

  async run() {
    const { flags: { token } } = this.parse(AppIdUpdaterCommand);

    if (!token) {
      this.error('Please provide a token with --token flag');
    }
    try {
      await this.authorize(token);
      await this.setAppList();
      await this.selectApp();
      await this.askNewUrl();
      await this.updateAppList();
    } catch (error) {
      this.error(error.message);
    } finally {
      api.disconnect();
    }
  }

  async updateAppList() {
    const response = await api.appUpdate(this.newRequest);
    if (response.error) {
      throw new Error(`Updating app failed with error: ${response.error.message}`);
    }
    this.log(`App id ${this.selectedAppId} was successfully updated.`);
  }

  async askNewUrl() {
    const newUrl = await cli.prompt('Enter the new url, e.g: https://deriv-app-vpvmqii9d.binary.sx/');
    if (!isURL(newUrl)) {
      throw new Error('Invalid url');
    }

    const toUpdate = this.appList.find((application) => application.app_id === this.selectedAppId);
    if (!toUpdate) {
      throw new Error('App ID was not found in the APP List');
    }
    const request = {
      redirect_uri: newUrl,
      verification_uri: `${newUrl}/en/redirect`,
      app_markup_percentage: 0,
      app_update: this.selectedAppId,
      homepage: toUpdate.homepage,
      name: toUpdate.name,
      scopes: toUpdate.scopes,
    };

    cli.table([request], {
      app_id: {},
      redirect_uri: {},
      verification_uri: {},
    }, {});
    if (await cli.confirm('Are you sure you want to update the app with the above data? [y/n]')) {
      this.newRequest = request;
    } else {
      throw new Error('Confirmation failed, please try again');
    }
  }

  async selectApp() {
    const responses = await inquirer.prompt([
      {
        name: 'appList',
        message: 'select an application',
        type: 'list',
        choices: this.appListChoices,
      },
    ]);
    const [first] = responses.appList.split(':');

    this.selectedAppId = Number(first);
  }

  async setAppList() {
    const appListResponse = await api.appList();
    if (appListResponse.error) {
      throw new Error(appListResponse.error.message);
    }
    this.appList = appListResponse.app_list;

    this.appListChoices = this.appList.map((app) => ({
      name: `${app.app_id}: -> ${app.redirect_uri}`,
    }));
  }

  async authorize(token) {
    const authorizeResponse = await api.authorize(token);

    if (authorizeResponse.error) {
      throw new Error(authorizeResponse.error.message);
    } else {
      this.authorizeResponse = authorizeResponse;
    }
  }
}

AppIdUpdaterCommand.description = `This command will re-use the APP id for your test links
________               .__
\\______ \\   ___________|__|__  __
 |    |  \\_/ __ \\_  __ \\  \\  \\/ /
 |    \`   \\  ___/|  | \\/  |\\   /
/_______  /\\___  >__|  |__| \\_/
        \\/     \\/
Since this is interactive, you will be presented with the list of your app_ids and which one
you need to update.
`;

AppIdUpdaterCommand.flags = {
  // add --version flag to show CLI version
  version: flags.version({ char: 'v' }),
  // add --help flag to show CLI version
  help: flags.help({ char: 'h' }),
  token: flags.string({ char: 'n', description: 'API token (visit API token page on website)' }),
};

module.exports = AppIdUpdaterCommand;
