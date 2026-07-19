import { useTranslation } from 'react-i18next'
import { Form, Input, Button, Card } from 'antd'
import LanguageSwitcher from '../components/LanguageSwitcher'
import styles from './Login.module.css'

export default function Login() {
  const { t } = useTranslation()
  const onFinish = (_values: { username: string; password: string }) => {
    // 演示：任意账号密码可进入，后续接入真实登录 API
    localStorage.setItem('erp_token', 'demo-token')
    window.location.href = '/'
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.langBar}>
        <LanguageSwitcher />
      </div>
      <div className={styles.brandWrap}>
        <h1 className={styles.brandTitle}>{t('app.name')}</h1>
      </div>
      <Card className={styles.card} title={t('login.title')} bordered={false}>
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('login.placeholderUsername') }]}
          >
            <Input placeholder={t('login.placeholderUsername')} />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: t('login.placeholderPassword') }]}
          >
            <Input.Password placeholder={t('login.placeholderPassword')} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {t('common.login')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
