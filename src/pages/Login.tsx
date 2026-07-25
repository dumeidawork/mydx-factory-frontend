import { useTranslation } from 'react-i18next'
import { Form, Input, Button, Card } from 'antd'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { apiUrl } from '../utils/api'
import { message } from '../utils/feedback'
import { setAuthSession, type AuthUser } from '../utils/auth'
import styles from './Login.module.css'

type LoginForm = { username: string; password: string }

export default function Login() {
  const { t } = useTranslation()

  const onFinish = async (values: LoginForm) => {
    try {
      const res = await fetch(apiUrl('/api/v1/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: values.username.trim(),
          password: values.password,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string
        user?: AuthUser
        detail?: string | { msg?: string }[]
      }
      if (!res.ok || !data.access_token || !data.user) {
        const detail = data.detail
        const text =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d) => (typeof d === 'string' ? d : d.msg || '')).join('; ')
              : '登录失败'
        message.error(text || '用户名或密码错误')
        return
      }
      setAuthSession(data.access_token, data.user)
      window.location.href = '/'
    } catch {
      message.error('无法连接服务器，请确认后台已启动')
    }
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
        <Form name="login" onFinish={onFinish} autoComplete="off" layout="vertical" size="large">
          <Form.Item name="username" rules={[{ required: true, message: t('login.placeholderUsername') }]}>
            <Input placeholder={t('login.placeholderUsername')} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t('login.placeholderPassword') }]}>
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
