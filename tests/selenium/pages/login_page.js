const { By, until } = require('selenium-webdriver');

const config = require('../config');
const { BasePage } = require('./base_page');

class LoginPage extends BasePage {
  async openFresh() {
    await this.clearClientState();
    await this.goto('/login');
    await this.waitVisible(By.css('input[type="text"]'));
  }

  async login(username, password) {
    await this.openFresh();
    const usernameInput = await this.waitVisible(By.css('input[type="text"]'));
    const passwordInput = await this.waitVisible(By.css('input[type="password"]'));
    await usernameInput.clear();
    await usernameInput.sendKeys(username);
    await passwordInput.clear();
    await passwordInput.sendKeys(password);
    await this.driver.findElement(By.css('button[type="submit"]')).click();
  }

  async loginExpectDispatcher(username, password) {
    await this.login(username, password);
    await this.driver.wait(
      async () => /\/dispatch\//.test(await this.driver.getCurrentUrl()),
      config.defaultTimeoutMs,
      'Không chuyển vào dashboard dispatcher sau đăng nhập'
    );
  }

  async loginExpectDriver(username, password) {
    await this.login(username, password);
    await this.driver.wait(
      async () => /\/driver\//.test(await this.driver.getCurrentUrl()),
      config.defaultTimeoutMs,
      'Không chuyển vào dashboard tài xế sau đăng nhập'
    );
  }

  async submitBlank() {
    await this.openFresh();
    await this.driver.findElement(By.css('button[type="submit"]')).click();
  }

  async waitStillOnLogin() {
    await this.driver.wait(until.urlContains('/login'), config.defaultTimeoutMs);
  }
}

module.exports = {
  LoginPage
};
